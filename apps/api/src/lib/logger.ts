import pino from 'pino';

/**
 * Structured logger. JSON in prod, pretty in dev.
 *
 * Always pass context as the first arg, message as the second:
 *   logger.info({ userId, examId }, 'exam started')
 *
 * Sensitive fields (auth headers, passwords, tokens) are redacted.
 */
const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["sec-websocket-protocol"]',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      }),
});
