import { created, ok, paged } from '../../utils/response.js';
import * as s from './gst.service.js';

export const listTaxRates = async (req, res) => ok(res, await s.listTaxRates(req.valid.query));
export const createTaxRate = async (req, res) =>
  created(res, await s.createTaxRate(req.valid.body, req.user, req));
export const updateTaxRate = async (req, res) =>
  ok(res, await s.updateTaxRate(req.valid.params.id, req.valid.body, req.user, req));

export const listRecords = async (req, res) => paged(res, await s.listGstRecords(req.valid.query));
export const getRecord = async (req, res) => ok(res, await s.getGstRecord(req.valid.params.id));
export const preview = (req, res) => ok(res, s.previewGst(req.valid.body));
export const createRecord = async (req, res) =>
  created(res, await s.createGstRecord(req.valid.body, req.user, req));
export const voidRecord = async (req, res) =>
  ok(res, await s.voidGstRecord(req.valid.params.id, req.valid.body, req.user, req));

export const summary = async (req, res) => ok(res, await s.gstSummary(req.valid.query));
export const hsnSummary = async (req, res) => ok(res, await s.hsnSummary(req.valid.query));
export const gstr1 = async (req, res) => ok(res, await s.gstr1(req.valid.query));
export const gstr3b = async (req, res) => ok(res, await s.gstr3b(req.valid.query));
export const reconciliation = async (req, res) =>
  ok(res, await s.taxReconciliation(req.valid.query));
