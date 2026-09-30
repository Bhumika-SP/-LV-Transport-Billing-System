import pino from 'pino';
import { env } from '../config/env.js';

const prettyTransport = {
  target: 'pino-pretty',
  options: { colorize: true, translateTime: 'SYS:standard' },
};

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'lv-billing-api' },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'],
    censor: '[REDACTED]',
  },
  // Structured JSON in production (for the hosting platform's log drain); pretty output locally.
  ...(env.isProduction || env.isTest ? {} : { transport: prettyTransport }),
});
