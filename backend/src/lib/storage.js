import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';

/**
 * File storage driver (spec §53). Documents are private: they are only ever streamed
 * through the authorized /api/documents/:id/download route, never exposed by URL.
 *
 * Interface: put(key, buffer, mimeType) · get(key) → Readable · remove(key)
 *
 * - `local`: files under STORAGE_DIR (development, or a server with a persistent disk).
 * - `s3`: any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) for
 *   production hosts with ephemeral disks such as Render.
 */

function localDriver(root) {
  const resolve = (key) => {
    const full = path.resolve(root, key);
    // Keys are generated server-side, but never allow escaping the storage root.
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  };
  return {
    name: 'local',
    async put(key, buffer) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, buffer, { flag: 'wx' });
    },
    async get(key) {
      const full = resolve(key);
      await stat(full);
      return createReadStream(full);
    },
    async remove(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

function s3Driver() {
  let clientPromise;
  const client = () => {
    clientPromise ??= import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      s3: new sdk.S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: Boolean(env.S3_ENDPOINT),
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      }),
    }));
    return clientPromise;
  };
  const Bucket = env.S3_BUCKET;
  return {
    name: 's3',
    async put(key, buffer, mimeType) {
      const { sdk, s3 } = await client();
      await s3.send(
        new sdk.PutObjectCommand({
          Bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        }),
      );
    },
    async get(key) {
      const { sdk, s3 } = await client();
      const out = await s3.send(new sdk.GetObjectCommand({ Bucket, Key: key }));
      return out.Body instanceof Readable ? out.Body : Readable.fromWeb(out.Body);
    },
    async remove(key) {
      const { sdk, s3 } = await client();
      await s3.send(new sdk.DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

let driver;
export function storage() {
  driver ??= env.STORAGE_DRIVER === 's3' ? s3Driver() : localDriver(env.STORAGE_DIR);
  return driver;
}
