import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { ok } from '../../utils/response.js';
import { exportFileName, toCsv, toPdf, toXlsx } from './exporters.js';
import { listReports, runReport } from './reports.service.js';

const router = Router();
router.use(authenticate);

/** Reports the caller may run (permissions are checked per report). */
router.get('/', (req, res) => ok(res, listReports(req.user)));

const FORMATS = {
  csv: { type: 'text/csv; charset=utf-8', build: (r) => toCsv(r) },
  xlsx: {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    build: (r, u) => toXlsx(r, u),
  },
  pdf: { type: 'application/pdf', build: (r, u) => toPdf(r, u) },
};

/**
 * GET /api/reports/:key?format=json|csv|xlsx|pdf&<filters>
 * Same data, filters and permissions for screen and export; exports are audited.
 */
router.get('/:key', async (req, res) => {
  const { format = 'json', ...query } = req.query;
  const fmt = z.enum(['json', 'csv', 'xlsx', 'pdf']).parse(format);
  const report = await runReport(req.params.key, query, req.user);
  if (fmt === 'json') return ok(res, report);

  const body = await FORMATS[fmt].build(report, req.user);
  await recordAudit(null, {
    userId: req.user.id,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: 'Report',
    entityId: req.params.key,
    newValue: { format: fmt, filters: report.filters, rowCount: report.rowCount },
    req,
  });
  res.setHeader('Content-Type', FORMATS[fmt].type);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(report, fmt)}"`);
  res.send(body);
});

export default router;
