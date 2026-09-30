import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { singleFileUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import { MAX_IMPORT_BYTES } from './file-parser.js';
import * as c from './imports.controller.js';
import {
  confirmImportSchema,
  createTemplateSchema,
  errorReportQuery,
  listImportsQuery,
  listRowsQuery,
  listTemplatesQuery,
  updateTemplateSchema,
} from './imports.schemas.js';

const view = requirePermission(PERMISSIONS.IMPORT_VIEW);
const manage = requirePermission(PERMISSIONS.TRIP_IMPORT);

// Browsers report .csv/.xlsx with several MIME types; the bytes are verified after upload.
const upload = singleFileUpload({
  maxBytes: MAX_IMPORT_BYTES,
  allowedMime: [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
});

/** /api/import-templates */
export const templatesRouter = Router();
templatesRouter.use(authenticate);
templatesRouter.get('/meta', view, c.templateMeta);
templatesRouter.get('/', view, validate({ query: listTemplatesQuery }), c.listTemplates);
templatesRouter.post('/', manage, validate({ body: createTemplateSchema }), c.createTemplate);
templatesRouter.get('/:id', view, validate({ params: idParam }), c.getTemplate);
templatesRouter.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: updateTemplateSchema }),
  c.updateTemplate,
);

/** /api/trip-imports */
export const importsRouter = Router();
importsRouter.use(authenticate);
importsRouter.post('/inspect', manage, upload, c.inspect);
importsRouter.post('/', manage, upload, c.create);
importsRouter.get('/', view, validate({ query: listImportsQuery }), c.list);
importsRouter.get('/:id', view, validate({ params: idParam }), c.get);
importsRouter.get('/:id/rows', view, validate({ params: idParam, query: listRowsQuery }), c.rows);
importsRouter.get(
  '/:id/errors.csv',
  view,
  validate({ params: idParam, query: errorReportQuery }),
  c.errorReport,
);
importsRouter.post(
  '/:id/confirm',
  manage,
  validate({ params: idParam, body: confirmImportSchema }),
  c.confirm,
);
importsRouter.post('/:id/discard', manage, validate({ params: idParam }), c.discard);
