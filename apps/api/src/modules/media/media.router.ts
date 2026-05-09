// apps/api/src/modules/media/media.router.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, isTeacher } from '../../middleware/auth';
import { uploadMedia, validateMediaType } from '../../lib/storage';

const router = Router();
router.use(authenticate, isTeacher);

// Multer: memory storage, 10MB max, validated server-side
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const valid = validateMediaType(file.mimetype);
    if (valid) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/v1/media/questions/:questionId
 * Uploads image or audio for a question.
 * Returns { url, mediaType }
 */
router.post(
  '/questions/:questionId',
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    try {
      const result = await uploadMedia(
        req.user.schoolId!,
        req.params.questionId,
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );

      // Update the question's mediaUrl in the DB
      const prisma = (await import('../../lib/prisma')).default;
      await prisma.question.update({
        where: { id: req.params.questionId },
        data: { mediaUrl: result.url },
      });

      res.json({ data: { url: result.url, mediaType: result.mediaType } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/v1/media/questions/:questionId
 * Removes the media attachment from a question.
 */
router.delete('/questions/:questionId', async (req: Request, res: Response) => {
  const prisma = (await import('../../lib/prisma')).default;
  await prisma.question.update({
    where: { id: req.params.questionId },
    data: { mediaUrl: null },
  });
  res.json({ data: { removed: true } });
});

export default router;
