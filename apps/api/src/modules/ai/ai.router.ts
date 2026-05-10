// apps/api/src/modules/ai/ai.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, isTeacher } from '../../middleware/auth';
import { buildQuestionGenPrompt, PromptInjectionError } from '../../lib/aiPrompt';
import { schoolFeatureEnabled } from '../../lib/featureFlags';

const router = Router();
router.use(authenticate, isTeacher);

// Cycle 2.0e / D4: every AI route on this router is gated behind the
// 'ai-authoring' per-school feature flag. PLATFORM_ADMIN bypasses the flag
// since they're vendor support and may need to debug a school that has it
// off; their actions are auditable separately.
async function requireAiAuthoring(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user.role === 'PLATFORM_ADMIN') {
    next();
    return;
  }
  const enabled = await schoolFeatureEnabled(req.user.schoolId, 'ai-authoring');
  if (!enabled) {
    res.status(403).json({
      error: 'AI authoring is not enabled for your school. Ask your school admin to opt in.',
      code: 'feature_disabled',
      feature: 'ai-authoring',
    });
    return;
  }
  next();
}
router.use(requireAiAuthoring);

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

  const difficultyLabel = ({ 1: 'easy', 2: 'medium', 3: 'hard' } as const)[difficulty];

  // Build the prompt with user-input isolation + injection guard
  let system: string, user: string;
  try {
    const promptCtx = {
      subject: subject || 'general',
      text,
      count,
      type: (type === 'MCQ_MULTI' ? 'MCQ' : type) as 'MCQ' | 'TRUE_FALSE' | 'SHORT_TEXT',
      difficulty: difficultyLabel,
    };
    const built = buildQuestionGenPrompt(promptCtx);
    // Append type-specific schema requirement onto the user message,
    // not the system prompt — keeps system prompt static.
    const typeReq =
      type === 'MCQ'
        ? 'Each question must have 4 options (ids "a","b","c","d") and 1 correct.'
        : type === 'MCQ_MULTI'
          ? 'Each question must have 4 options and 2 correct.'
          : 'Each question must have 2 options ("true","false") and 1 correct.';
    user =
      built.user +
      '\n\nReturn ONLY a JSON array. ' +
      typeReq +
      ' Each item: {body,type,options:[{id,text}],correctIds,explanation,points,difficulty,tags}.';
    system = built.system;
  } catch (e: any) {
    if (e instanceof PromptInjectionError) {
      res.status(400).json({ error: e.message });
      return;
    }
    throw e;
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: user }],
      system,
    });

    const raw = message.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

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
    const validated = questions
      .map((q, i) => ({
        body: String(q.body || '').trim(),
        type: q.type || type,
        options: Array.isArray(q.options) ? q.options : [],
        correctIds: Array.isArray(q.correctIds) ? q.correctIds : [],
        explanation: String(q.explanation || '').trim(),
        points: Number(q.points) || 1,
        difficulty: Number(q.difficulty) || difficulty,
        tags: Array.isArray(q.tags) ? q.tags.slice(0, 5) : [],
        _index: i,
      }))
      .filter((q) => q.body.length > 0 && q.correctIds.length > 0);

    res.json({ data: validated });
  } catch (err: any) {
    // Always log the full error server-side; never expose provider details
    // to the client. Generic messages out, full context in logs.
    console.error('[AI] Generation error:', err?.message ?? err);
    if (err?.status === 401) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else if (err?.status === 429) {
      res.status(429).json({ error: 'AI is busy — please try again shortly' });
    } else {
      res.status(500).json({ error: 'AI generation failed' });
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
    questions: z
      .array(
        z.object({
          body: z.string().min(1),
          type: z.enum(['MCQ', 'MCQ_MULTI', 'TRUE_FALSE']),
          options: z.array(z.object({ id: z.string(), text: z.string() })),
          correctIds: z.array(z.string()),
          explanation: z.string().optional(),
          points: z.number().positive().default(1),
          difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
          tags: z.array(z.string()).default([]),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const prisma = (await import('../../lib/prisma')).default;

  const created = await Promise.all(
    parsed.data.questions.map((q) =>
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
