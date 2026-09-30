import multer from 'multer';
import { AppError } from '../utils/AppError.js';

/**
 * Single-file upload held in memory (never written to disk here), with a size limit.
 * Content type is verified from the file bytes by the consumer; the client-supplied
 * MIME type is only a first filter.
 */
export function singleFileUpload({ field = 'file', maxBytes, allowedMime }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 20 },
    fileFilter: (_req, file, cb) => {
      if (allowedMime && !allowedMime.includes(file.mimetype)) {
        return cb(AppError.badRequest('Unsupported file type', 'UNSUPPORTED_FILE_TYPE'));
      }
      cb(null, true);
    },
  }).single(field);

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(
          err.code === 'LIMIT_FILE_SIZE'
            ? new AppError(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`, {
                status: 413,
                code: 'FILE_TOO_LARGE',
              })
            : AppError.badRequest(err.message, 'UPLOAD_ERROR'),
        );
      }
      if (err) return next(err);
      if (!req.file) return next(AppError.badRequest('No file was uploaded', 'FILE_REQUIRED'));
      // Keep only the base name; never trust client paths.
      req.file.originalname = req.file.originalname.split(/[\\/]/).pop().slice(0, 255);
      next();
    });
}
