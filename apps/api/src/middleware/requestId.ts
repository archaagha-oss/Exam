import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

/**
 * Attach a request id (UUID) to every request and echo it in the response
 * header X-Request-Id. Use req.id in logs to correlate.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
