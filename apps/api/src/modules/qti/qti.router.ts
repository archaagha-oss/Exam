// apps/api/src/modules/qti/qti.router.ts
// QTI 2.1/2.2 XML question import
import { Router, Request, Response } from 'express';
import { authenticate, isTeacher } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, isTeacher);

interface ParsedQuestion {
  body: string;
  type: string;
  options: { id: string; text: string }[];
  correctIds: string[];
  points: number;
  tags: string[];
}

/**
 * POST /api/v1/qti/import
 * Body: { xml: string }  — raw QTI 2.x XML content
 * Returns parsed questions for review before saving.
 */
router.post('/import', async (req: Request, res: Response) => {
  const { xml } = req.body;
  if (!xml || typeof xml !== 'string') {
    res.status(400).json({ error: 'xml field is required' });
    return;
  }

  try {
    const questions = parseQTI(xml);
    if (questions.length === 0) {
      res.status(400).json({ error: 'No valid questions found in the QTI XML' });
      return;
    }
    res.json({ data: { parsed: questions.length, questions } });
  } catch (err: any) {
    res.status(400).json({ error: `QTI parse error: ${err.message}` });
  }
});

/**
 * POST /api/v1/qti/import/save
 * Save previously-parsed QTI questions to the question bank.
 */
router.post('/import/save', async (req: Request, res: Response) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'questions array required' });
    return;
  }

  const created = await Promise.all(
    questions.map((q: ParsedQuestion) =>
      prisma.question.create({
        data: {
          createdBy: req.user.sub,
          schoolId: req.user.schoolId!,
          type: q.type as any,
          body: q.body,
          options: q.options as any,
          correctIds: q.correctIds as any,
          points: q.points,
          difficulty: 2,
          tags: [...q.tags, 'qti-import'],
        },
      })
    )
  );

  res.status(201).json({ data: { saved: created.length } });
});

// ── QTI 2.x Parser ────────────────────────────────────────────────────────
// Pure string-based parser — no XML library dependency needed
function parseQTI(xml: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Extract all <assessmentItem> blocks
  const itemRegex = /<assessmentItem[^>]*>([\s\S]*?)<\/assessmentItem>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];

    try {
      const q = parseItem(itemXml);
      if (q) questions.push(q);
    } catch { /* skip malformed items */ }
  }

  // Also handle <item> (QTI 1.2 / older format)
  if (questions.length === 0) {
    const item12Regex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let item12Match: RegExpExecArray | null;
    while ((item12Match = item12Regex.exec(xml)) !== null) {
      try {
        const q = parseItem12(item12Match[1]);
        if (q) questions.push(q);
      } catch { /* skip */ }
    }
  }

  return questions;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return m ? stripTags(m[1]) : '';
}

function extractAttr(xml: string, attr: string): string {
  const m = new RegExp(`${attr}="([^"]*)"`, 'i').exec(xml);
  return m ? m[1] : '';
}

function parseItem(itemXml: string): ParsedQuestion | null {
  // Question body — try multiple QTI elements
  let body = extractText(itemXml, 'prompt') ||
    extractText(itemXml, 'itemBody') ||
    extractText(itemXml, 'p') ||
    extractText(itemXml, 'div');

  if (!body) return null;

  // Detect interaction type
  const hasChoiceInteraction = /<choiceInteraction/i.test(itemXml);
  const hasTextInteraction = /<extendedTextInteraction|<textEntryInteraction/i.test(itemXml);
  const hasOrderInteraction = /<orderInteraction/i.test(itemXml);

  if (hasTextInteraction || hasOrderInteraction) {
    return {
      body,
      type: 'SHORT_TEXT',
      options: [],
      correctIds: [],
      points: parseFloat(extractAttr(itemXml, 'points') || '1') || 1,
      tags: [],
    };
  }

  if (!hasChoiceInteraction) return null;

  // Parse choices
  const choiceRegex = /<simpleChoice\s+identifier="([^"]+)"[^>]*>([\s\S]*?)<\/simpleChoice>/gi;
  const options: { id: string; text: string }[] = [];
  let choiceMatch: RegExpExecArray | null;

  while ((choiceMatch = choiceRegex.exec(itemXml)) !== null) {
    const id = choiceMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '_');
    const text = stripTags(choiceMatch[2]);
    if (text) options.push({ id, text });
  }

  if (options.length < 2) return null;

  // Parse correct responses
  const correctIds: string[] = [];
  const responseRegex = /<value>([^<]+)<\/value>/gi;
  const correctSection = /<correctResponse>([\s\S]*?)<\/correctResponse>/i.exec(itemXml);
  if (correctSection) {
    let rv: RegExpExecArray | null;
    const rr = /<value>([^<]+)<\/value>/gi;
    while ((rv = rr.exec(correctSection[1])) !== null) {
      const normalized = rv[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      // Match to option id
      const matched = options.find(o =>
        o.id === normalized || o.id.startsWith(normalized.slice(0, 3))
      );
      if (matched) correctIds.push(matched.id);
    }
  }
  void responseRegex; // unused but referenced above

  const maxChoices = parseInt(extractAttr(itemXml, 'maxChoices') || '1') || 1;
  const type = options.length === 2 && options.every(o => ['true', 'false', 'yes', 'no'].includes(o.text.toLowerCase()))
    ? 'TRUE_FALSE'
    : maxChoices > 1
    ? 'MCQ_MULTI'
    : 'MCQ';

  // Points from outcomeDeclaration
  const outcomeMatch = /<outcomeDeclaration[^>]*identifier="SCORE"[^>]*>[\s\S]*?<defaultValue>[\s\S]*?<value>([^<]+)<\/value>/i.exec(itemXml);
  const points = outcomeMatch ? parseFloat(outcomeMatch[1]) || 1 : 1;

  return { body, type, options, correctIds, points, tags: [] };
}

function parseItem12(itemXml: string): ParsedQuestion | null {
  // QTI 1.2 format
  const body = extractText(itemXml, 'mattext') || extractText(itemXml, 'material');
  if (!body) return null;

  const responseLabels: { id: string; text: string }[] = [];
  const labelRegex = /<response_label\s+ident="([^"]+)"[^>]*>([\s\S]*?)<\/response_label>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = labelRegex.exec(itemXml)) !== null) {
    const text = stripTags(lm[2]);
    if (text) responseLabels.push({ id: lm[1].toLowerCase(), text });
  }

  const correctIds: string[] = [];
  const varEqualRegex = /<varequal[^>]*>([^<]+)<\/varequal>/gi;
  let vm: RegExpExecArray | null;
  while ((vm = varEqualRegex.exec(itemXml)) !== null) {
    correctIds.push(vm[1].trim().toLowerCase());
  }

  if (responseLabels.length < 2) return null;

  return {
    body,
    type: 'MCQ',
    options: responseLabels,
    correctIds,
    points: 1,
    tags: [],
  };
}

export default router;
