import { created, ok, paged } from '../../utils/response.js';
import * as templates from './import-templates.service.js';
import { createImportFields } from './imports.schemas.js';
import * as imports from './trip-imports.service.js';

// ---- Templates ---------------------------------------------------------------------
export function templateMeta(_req, res) {
  ok(res, templates.templateMeta());
}
export async function listTemplates(req, res) {
  ok(res, await templates.listTemplates(req.valid.query));
}
export async function getTemplate(req, res) {
  ok(res, await templates.getTemplate(req.valid.params.id));
}
export async function createTemplate(req, res) {
  created(res, await templates.createTemplate(req.valid.body, req.user, req));
}
export async function updateTemplate(req, res) {
  ok(res, await templates.updateTemplate(req.valid.params.id, req.valid.body, req.user, req));
}

// ---- Imports -----------------------------------------------------------------------
export async function inspect(req, res) {
  ok(res, await imports.inspectFile(req.file));
}
export async function create(req, res) {
  const fields = createImportFields.parse(req.body);
  created(res, await imports.createImport({ ...fields, file: req.file }, req.user, req));
}
export async function list(req, res) {
  paged(res, await imports.listImports(req.valid.query));
}
export async function get(req, res) {
  ok(res, await imports.getImport(req.valid.params.id));
}
export async function rows(req, res) {
  paged(res, await imports.listImportRows(req.valid.params.id, req.valid.query));
}
export async function confirm(req, res) {
  ok(res, await imports.confirmImport(req.valid.params.id, req.valid.body, req.user, req));
}
export async function discard(req, res) {
  ok(res, await imports.discardImport(req.valid.params.id, req.user, req));
}
export async function errorReport(req, res) {
  const { fileName, content } = await imports.errorReportCsv(req.valid.params.id, req.valid.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
  );
  res.send(content);
}
