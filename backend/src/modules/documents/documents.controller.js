import { created, ok } from '../../utils/response.js';
import * as service from './documents.service.js';

export async function list(req, res) {
  ok(res, await service.listDocuments(req.valid.query, req.user));
}
export async function upload(req, res) {
  created(res, await service.uploadDocument(req.valid.body, req.file, req.user, req));
}
export async function remove(req, res) {
  ok(res, await service.deleteDocument(req.valid.params.id, req.valid.body, req.user, req));
}

/** Stream the file through the API: documents never have public URLs. */
export async function download(req, res, next) {
  const { doc, stream } = await service.openDocument(req.valid.params.id, req.user);
  const inline = req.valid.query.inline;
  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.set({
    'Content-Type': doc.mimeType,
    'Content-Length': String(doc.sizeBytes),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  stream.on('error', next);
  stream.pipe(res);
}
