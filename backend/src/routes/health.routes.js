import { Router } from 'express';
import { checkDatabase } from '../lib/prisma.js';

const router = Router();

/**
 * GET /health
 * Liveness + database readiness. Returns 503 when the database is unreachable
 * so the hosting platform's health check can detect a broken deployment.
 */
router.get('/', async (req, res) => {
  const base = {
    service: 'lv-billing-api',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  try {
    const db = await checkDatabase();
    res.status(200).json({
      success: true,
      data: { ...base, status: 'ok', database: { status: 'up', ...db } },
    });
  } catch (err) {
    req.log?.error({ err }, 'Health check: database unreachable');
    res.status(503).json({
      success: false,
      message: 'Database is unreachable',
      code: 'DATABASE_UNAVAILABLE',
      data: { ...base, status: 'degraded', database: { status: 'down' } },
    });
  }
});

export default router;
