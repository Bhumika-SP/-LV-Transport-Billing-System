# Deployment

Target V1 topology. There is deliberately no Kubernetes, microservices, Redis or queue.

```
Browser ──HTTPS──▶ Vercel (React SPA)
                     │  rewrite /api/*, /health
                     ▼
                  Render (Node/Express API) ──TLS──▶ Managed MySQL 8
                     │
                     └──────────▶ Private S3-compatible bucket (documents)
```

Because Vercel proxies `/api`, the browser sees a single origin. The auth cookie is
therefore first-party (`HttpOnly; Secure; SameSite=Lax`) and unaffected by
third-party-cookie blocking.

## 1. Database: managed MySQL 8

- Provision MySQL 8 (e.g. Aiven, DigitalOcean, AWS RDS) with TLS required.
- Create database `lv_billing` (`utf8mb4_unicode_ci`) and a dedicated app user. Do **not** use root in production.
- Enable automated daily backups with point-in-time recovery, and test a restore before go-live.
- From Phase 16, restrict the app user to `INSERT, SELECT` on `audit_logs`.

## 2. Backend: Render web service

| Setting           | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Root directory    | repository root                                                        |
| Build command     | `npm ci && npm run db:deploy -w backend && npm run db:seed -w backend` |
| Start command     | `npm start -w backend`                                                 |
| Health check path | `/health`                                                              |
| Node version      | 22 (`.nvmrc`)                                                          |

Environment variables (Render dashboard, never in git):

| Variable            | Example                                                    | Notes                                 |
| ------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `NODE_ENV`          | `production`                                               | Disables stack traces and pretty logs |
| `PORT`              | set by Render                                              |                                       |
| `DATABASE_URL`      | `mysql://lv_app:***@host:3306/lv_billing?sslaccept=strict` |                                       |
| `CORS_ORIGINS`      | `https://lv-billing.vercel.app`                            | Comma-separated                       |
| `LOG_LEVEL`         | `info`                                                     |                                       |
| `JWT_SECRET`        | 32+ random chars                                           | Added in Phase 2                      |
| Storage credentials | bucket, key, secret, endpoint                              | Added in Phase 15                     |

Migrations run on every deploy through `prisma migrate deploy`, which is idempotent. `db:seed` then
re-syncs roles and permissions. In production it never creates dev users or demo data.

**First admin (once):** from a Render shell:

```bash
ADMIN_PASSWORD='<strong password>' npm run create-admin -w backend -- --email owner@lvtransport.in --name "Owner Name"
```

The API refuses to start if required environment variables are missing or invalid.

## 3. Frontend: Vercel

| Setting          | Value                    |
| ---------------- | ------------------------ |
| Root directory   | `frontend`               |
| Build command    | `npm run build`          |
| Output directory | `dist`                   |
| Env              | `VITE_API_BASE_URL=/api` |

Edit `frontend/vercel.json` and replace `YOUR-RENDER-SERVICE` with the Render hostname.
The file also provides the SPA fallback to `index.html`.

## 4. Documents (Phase 15)

Files are served only through the authorized API download endpoint; there are no
public URLs.

- **Render (ephemeral disk):** use an S3-compatible **private** bucket (Cloudflare R2,
  AWS S3, Backblaze B2). Set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`
  (`auto` for R2), `S3_ENDPOINT` (omit for AWS), `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`. Give the key access to that bucket only
  (PutObject/GetObject/DeleteObject). Objects are written with server-side encryption.
- **Server with a persistent disk:** `STORAGE_DRIVER=local` and `STORAGE_DIR` on the
  persistent volume. Include it in backups.
- Removal is a soft delete; files are kept. Apply bucket lifecycle rules only after
  agreeing a retention period with the business.

### Notifications

`NOTIFICATION_CHECK_HOURS` (default 6, `0` disables) controls the in-process check for
expiring documents and pending company settlements. Alerts are deduplicated in the
database, so several instances or restarts do not send duplicates.

## 5. Logging

The API writes structured JSON logs (Pino) to stdout. Render captures them, and a log
drain can forward them. Every log line and response carries a request ID. Cookies,
authorization headers and passwords are redacted.

## 6. Release checklist

- [ ] `npm run lint`, `npm test` and `npm run build` pass
- [ ] `prisma migrate status` is clean against staging
- [ ] Environment variables set, with no placeholder secrets
- [ ] `/health` returns 200 on the deployed API
- [ ] Backup ran in the last 24 hours
