import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so thrown errors / rejected promises always
 * reach Express's error middleware. Without this, an unhandled rejection
 * inside an async route causes a hung request.
 *
 * Usage:
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
