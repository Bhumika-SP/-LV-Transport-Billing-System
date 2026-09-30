import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import healthRoutes from './routes/health.routes.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();

  // Render sits behind one proxy hop; needed for correct client IPs (rate limiting, audit).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Reuse an upstream request ID only if it is short and safe to log and store
        // (audit_logs.request_id is VARCHAR(64)); otherwise mint a new one.
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (no Origin header) and configured frontends only.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true, // required for HTTP-only auth cookies
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/health', healthRoutes);
  // Financial data must never be stored by browsers or shared caches.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
