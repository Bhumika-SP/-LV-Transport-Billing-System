import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { singleFileUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { DOCUMENT_MIME_TYPES } from '../../utils/file-type.js';
import { idParam, optionalText, reasonText } from '../../validation/common.js';
import * as c from './documents.controller.js';
import { DOCUMENT_ENTITY_TYPES, MAX_DOCUMENT_BYTES } from './documents.service.js';

const target = {
  entityType: z.enum(DOCUMENT_ENTITY_TYPES),
  entityId: z.coerce.number().int().positive(),
};

const upload = singleFileUpload({
  maxBytes: MAX_DOCUMENT_BYTES,
  // First filter only; the stored type is decided from the file bytes.
  allowedMime: [...DOCUMENT_MIME_TYPES, 'image/jpg', 'application/octet-stream'],
});

// Authorization is per record type (see DOCUMENT_ENTITIES), enforced in the service.
const router = Router();
router.use(authenticate);
router.get('/', validate({ query: z.object(target) }), c.list);
router.post(
  '/',
  upload,
  validate({
    body: z.object({ ...target, category: optionalText(50), notes: optionalText(500) }),
  }),
  c.upload,
);
router.get(
  '/:id/download',
  validate({
    params: idParam,
    query: z.object({
      inline: z
        .enum(['1', '0', 'true', 'false'])
        .optional()
        .transform((v) => v === '1' || v === 'true'),
    }),
  }),
  c.download,
);
router.delete(
  '/:id',
  validate({ params: idParam, body: z.object({ reason: reasonText }) }),
  c.remove,
);

export default router;
