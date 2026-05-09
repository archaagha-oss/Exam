import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Wrap a zod schema as Express middleware. On success, replaces req.body
 * with the parsed (typed) data. On failure, responds 400 and stops.
 *
 * Use it on every route that accepts a body. Combined with an ESLint rule
 * forbidding raw `req.body` access in modules/, this becomes a structural
 * guarantee.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid input',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: result.error.flatten() });
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}
