/**
 * Detect a file's real type from its leading bytes ("magic numbers"). The client's
 * declared MIME type and extension are never trusted for stored documents.
 */
const SIGNATURES = [
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export const DOCUMENT_MIME_TYPES = SIGNATURES.map((s) => s.mime);

/** @returns {{ mime: string, ext: string } | null} */
export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const hit = SIGNATURES.find((s) => s.test(buffer));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}
