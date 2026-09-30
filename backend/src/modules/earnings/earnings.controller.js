import { ok } from '../../utils/response.js';
import { grossEarningsBreakdown } from './earnings.service.js';

/** Gross earnings per driver per month with each component (spec §21). */
export async function gross(req, res) {
  ok(res, await grossEarningsBreakdown(req.valid.query));
}
