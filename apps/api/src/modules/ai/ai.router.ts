// apps/api/src/modules/ai/ai.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, isTeacher } from '../../middleware/auth';

const router = Router();
router.use(authenticate, isTeacher);

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const generateSchema = z.object({
  text: z.string().min(20).max(8000),
  count: z.number().int().min(1).max(20).default(5),
  type: z.enum(['MCQ', 'TRUE_FALSE', 'MCQ_MULTI']).default('MCQ'),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  subject: z.string().max(100).optional(),
});

/**
 * POST /api/v1/ai/generate-questions
 * Generate MCQ/True-False questions from curriculum text using Claude.
 *
 * Returns an array of question objects ready to be saved to the question bank.
 */
router.post('/generate-questions', async (req: Request, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { text, count, type, difficulty, subject } = parsed.data;

  const difficultyLabel = { 1: 'easy', 2: 'medium', 3: 'hard' }[difficulty];

  const typeInstructions = {
    MCQ: `Each question should have exactly 4 answer options (A, B, C, D) with exactly one correct answer.`,
    MCQ_MULTI: `Each question should have exactly 4 answer options (A, B, C, D) with 2 correct answers.`,
    TRUE_FALSE: `Each question should have exactly 2 options: "True" and "False" with exactly one correct.`,
  }[type];

  const systemPrompt = `You are an expert educator creating high-quality exam questions.
You always respond with valid JSON only — no markdown, no preamble, no explanation.
All questions must be factually accurate and directly based on the provided text.`;

  const userPrompt = `Create ${count} ${difficultyLabel} difficulty ${type} exam questions from the following text.
${subject ? `Subject area: ${subject}` : ''}

TEXT:
${text}

REQUIREMENTS:
- Questions must be answerable using only the provided text
- ${typeInstructions}
- Difficulty: ${difficultyLabel} (${difficulty === 1 ? 'recall-based' : difficulty === 2 ? 'application/understanding' : 'analysis/evaluation'})
- Each question must be distinct, not repetitive
- Option IDs must be lowercase letters: "a", "b", "c", "d" (or "true"/"false" for TRUE_FALSE)
- Auto-generate 2-4 relevant tags from the content

Respond with ONLY a JSON array in this exact format:
[
  {
    "body": "Question text here?",
    "type": "${type}",
    "options": [
      {"id": "a", "text": "Option A text"},
      {"id": "b", "text": "Option B text"},
      {"id": "c", "text": "Option C text"},
      {"id": "d", "text": "Option D text"}
    ],
    "correctIds": ["b"],
    "explanation": "Brief explanation of why this is correct",
    "points": 1,
    "difficulty": ${difficulty},
    "tags": ["tag1", "tag2"]
  }
]`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const raw = message.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let questions: any[];
    try {
      questions = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' });
      return;
    }

    if (!Array.isArray(questions)) {
      res.status(500).json({ error: 'Unexpected AI response format.' });
      return;
    }

    // Validate and normalise each question
    const validated = questions.map((q, i) => ({
      body: String(q.body || '').trim(),
      type: q.type || type,
      options: Array.isArray(q.options) ? q.options : [],
      correctIds: Array.isArray(q.correctIds) ? q.correctIds : [],
      explanation: String(q.explanation || '').trim(),
      points: Number(q.points) || 1,
      difficulty: Number(q.difficulty) || difficulty,
      tags: Array.isArray(q.tags) ? q.tags.slice(0, 5) : [],
      _index: i,
    })).filter(q => q.body.length > 0 && q.correctIds.length > 0);

    res.json({ data: validated });
  } catch (err: any) {
    if (err.status === 401) {
      res.status(500).json({ error: 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your .env.' });
    } else if (err.status === 429) {
      res.status(429).json({ error: 'AI rate limit hit. Please wait a moment and try again.' });
    } else {
      console.error('[AI] Generation error:', err.message);
      res.status(500).json({ error: 'AI generation failed. Please try again.' });
    }
  }
});

/**
 * POST /api/v1/ai/generate-questions/save
 * Save AI-generated questions directly to the question bank.
 * Accepts the array returned by /generate-questions plus any user edits.
 */
router.post('/generate-questions/save', async (req: Request, res: Response) => {
  const schema = z.object({
    questions: z.array(z.object({
      body: z.string().min(1),
      type: z.enum(['MCQ', 'MCQ_MULTI', 'TRUE_FALSE']),
      options: z.array(z.object({ id: z.string(), text: z.string() })),
      correctIds: z.array(z.string()),
      explanation: z.string().optional(),
      points: z.number().positive().default(1),
      difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
      tags: z.array(z.string()).default([]),
    })).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const prisma = (await import('../../lib/prisma')).default;

  const created = await Promise.all(
    parsed.data.questions.map(q =>
      prisma.question.create({
        data: {
          createdBy: req.user.sub,
          schoolId: req.user.schoolId!,
          type: q.type as any,
          body: q.body,
          options: q.options as any,
          correctIds: q.correctIds as any,
          rubric: q.explanation || undefined,
          points: q.points,
          difficulty: q.difficulty,
          tags: q.tags,
        },
      })
    )
  );

  res.status(201).json({ data: { saved: created.length, questions: created } });
});

export default router;
