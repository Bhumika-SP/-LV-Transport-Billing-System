# Deployment

The production topology is deliberately simple: no Kubernetes, microservices, Redis or queue.

```
Browser ──HTTPS──▶ Vercel (React SPA, security headers)
                     │  same-origin rewrite of /api/* and /health
                     ▼
                  Render (Node 22 / Express API) ──TLS──▶ Managed MySQL 8
                     │
                     └──HTTPS──▶ Private S3-compatible bucket (documents)
```

Vercel proxies `/api`, so the browser only ever talks to one origin. That has three
consequences:

- The auth cookie is first-party (`HttpOnly; Secure; SameSite=Lax`) and is not affected by third-party-cookie blocking.
- Document downloads work as ordinary links.
- CORS only has to allow the Vercel origin, for direct and preview calls.

**Keep `VITE_API_BASE_URL=/api`.** Pointing the SPA straight at the Render URL would make
the cookie third-party.

## 0. Before you start

| You need                         | Notes                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| GitHub repository with this code | CI (`.github/workflows/ci.yml`) runs on every push and pull request |
| Managed MySQL 8                  | TLS, automated backups with point-in-time recovery, trigger support |
| S3-compatible private bucket     | Cloudflare R2, AWS S3 or Backblaze B2                               |
| Render account                   | Web service, created from `render.yaml`                             |
| Vercel account                   | Static SPA from `frontend/`                                         |
| A domain (optional)              | For example `billing.lvtransport.in` on Vercel                      |

## 1. Database: managed MySQL 8

1. Provision MySQL **8.0+** with **TLS required** (for example Aiven, DigitalOcean or AWS RDS) in the same region as Render (Singapore is closest to India on Render).
2. Create the database and a dedicated application user. Never use root in production.

   ```sql
   CREATE DATABASE lv_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'lv_app'@'%' IDENTIFIED BY '<long random password>';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES, TRIGGER,
         CREATE TEMPORARY TABLES, LOCK TABLES ON lv_billing.* TO 'lv_app'@'%';
   ```

   The DDL grants are needed because migrations run as this user on deploy. If your
   provider supports it, use a separate migration user and give the runtime user only
   `SELECT, INSERT, UPDATE, DELETE`.

3. **Triggers:** migration `20261001000000_audit_append_only` creates triggers. With binary
   logging on (the default on managed MySQL), set the server parameter
   `log_bin_trust_function_creators = 1` in the provider console **before the first
   deploy**, or the migration fails with a `SUPER privilege` error.
4. Enable automated daily backups with point-in-time recovery of at least 7 days, and the
   slow-query log (`long_query_time = 1`).
5. Connection string, with TLS enforced and a small pool:

   ```
   mysql://lv_app:<password>@<host>:<port>/lv_billing?sslaccept=strict&connection_limit=5
   ```

## 2. Documents: private bucket

1. Create a **private** bucket, for example `lv-billing-documents`. Never enable public access.
2. Turn on **object versioning**, with a lifecycle rule that expires non-current versions after 90 days.
3. Create an API token or key limited to this bucket, with `PutObject`, `GetObject` and `DeleteObject` only.
4. Note the bucket name, endpoint (R2: `https://<account-id>.r2.cloudflarestorage.com`; omit for AWS), region (`auto` for R2) and keys.

Files are only ever streamed through the authorized `/api/documents/:id/download`
endpoint, and objects are written with server-side encryption.

## 3. Backend: Render

### Create the service

In Render choose **New → Blueprint** and select the repository. `render.yaml` defines the
web service:

| Setting       | Value                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Build command | `npm ci --workspace backend --include-workspace-root && npm run db:deploy -w backend && npm run db:seed -w backend` |
| Start command | `npm start -w backend`                                                                                              |
| Health check  | `/health` (returns 503 when the database is unreachable, so Render will not route traffic to a broken deploy)       |
| Node          | 22                                                                                                                  |
| Auto-deploy   | on push to `main`, after CI                                                                                         |

### Environment variables

Render prompts for the `sync: false` values when the blueprint is applied. Never commit them.

| Variable                                                                            | Value                                                         | Required |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| `NODE_ENV`                                                                          | `production` (set by blueprint)                               | yes      |
| `DATABASE_URL`                                                                      | see step 1.5                                                  | yes      |
| `JWT_SECRET`                                                                        | generated by Render (or `openssl rand -base64 48`)            | yes      |
| `CORS_ORIGINS`                                                                      | `https://billing.lvtransport.in,https://<project>.vercel.app` | yes      |
| `SESSION_HOURS`                                                                     | `8`                                                           | no       |
| `COOKIE_SAMESITE`                                                                   | `lax`                                                         | no       |
| `STORAGE_DRIVER`                                                                    | `s3`                                                          | yes      |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from step 2                                                   | yes      |
| `NOTIFICATION_CHECK_HOURS`                                                          | `6` (`0` disables expiry and pending checks)                  | no       |
| `LOG_LEVEL`                                                                         | `info`                                                        | no       |
| `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MINUTES`                           | `10`, `15`                                                    | no       |

The API **refuses to start** in production in any of these cases:

- a required variable is missing;
- `CORS_ORIGINS` is not HTTPS, or is localhost;
- `JWT_SECRET` looks like a placeholder;
- S3 is selected without credentials.

Secure cookies are forced in production. `SEED_USER_PASSWORD` must **not** be set in
production; development users are never created when `NODE_ENV=production`.

### Database migration process

- Every deploy runs `prisma migrate deploy`. It applies only migrations not yet recorded in `_prisma_migrations`, in order, and is safe to repeat.
- `db:seed` then syncs roles, permissions and the role→permission matrix. The server repeats this sync at startup.
- A failing migration fails the build, and the previous release keeps serving traffic.
- New migrations are created locally with `npm run db:migrate` (`prisma migrate dev`), reviewed in the pull request and committed with the code. Never edit an applied migration.
- Destructive changes are split into two releases: first add and backfill, then remove in a later release.

### First administrator (once)

Open **Render → Shell** for the service and run:

```bash
ADMIN_PASSWORD='<strong password>' npm run create-admin -w backend -- --email owner@lvtransport.in --name "Owner Name"
```

The owner then signs in and creates the Biller and Auditor users under **Users**.

## 4. Frontend: Vercel

1. Edit `frontend/vercel.json` and replace both `YOUR-RENDER-SERVICE.onrender.com` values with the Render hostname. Commit the change.
2. In Vercel choose **Add New → Project**, pick the repository and set:

   | Setting          | Value                    |
   | ---------------- | ------------------------ |
   | Root directory   | `frontend`               |
   | Framework        | Vite                     |
   | Build command    | `npm run build`          |
   | Output directory | `dist`                   |
   | Env              | `VITE_API_BASE_URL=/api` |

3. Add the custom domain. Vercel issues and renews the certificate.
4. Add the final origin(s) to `CORS_ORIGINS` on Render.

`vercel.json` provides:

- the SPA fallback;
- a strict Content-Security-Policy (`'self'` only, no framing);
- HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies;
- immutable caching for hashed assets, with `index.html` revalidated on every deploy.

## 5. HTTPS, CORS and cookies

| Concern | How it is handled                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| HTTPS   | Vercel and Render terminate TLS with managed certificates. HSTS is sent by Vercel; MySQL and S3 connections use TLS.           |
| CORS    | Allow-list from `CORS_ORIGINS`, with credentials. Unknown origins get no CORS headers.                                         |
| Cookies | `lv_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, expires after `SESSION_HOURS`. Revoked on password, role or status change. |
| CSRF    | All writes require `X-Requested-With: XMLHttpRequest` (verified for every route in CI).                                        |
| Proxy   | The API trusts one proxy hop (Render) for client IPs used in rate limiting and audit.                                          |

## 6. Health checks, logging and monitoring

- `GET /health` reports API uptime and database status: 200 when healthy, 503 when the database is down. Point an uptime monitor (for example Better Stack or UptimeRobot) at `https://<domain>/health` as well as Render's own check.
- Logs are structured JSON on stdout with a request ID on every line. The same ID is returned in `X-Request-ID` and stored in audit records. Cookies, authorization headers and passwords are redacted. Add a Render log stream to your log platform for retention beyond Render's window.
- Alert on: `/health` failures, 5xx rate, and failed-login bursts (also shown on the Auditor dashboard).

## 7. Backups and restore

See [SECURITY.md → Backups and recovery](SECURITY.md#backups-and-recovery). In short:

- daily managed backups with point-in-time recovery;
- a weekly encrypted `mysqldump --single-transaction --triggers` stored off-provider;
- versioning on the documents bucket;
- a quarterly restore drill.

## 8. Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request. It
installs, then runs lint, the formatting check, backend and frontend tests against a
MySQL 8 service, the frontend build and `prisma migrate status`. Protect `main` so that
merges require CI to pass. Render auto-deploys `main`.

## 9. Release checklist

- [ ] CI is green on the commit being released
- [ ] New migrations reviewed. Anything destructive is split across releases
- [ ] `npm audit --omit=dev` reviewed and new findings recorded in SECURITY.md
- [ ] A backup ran in the last 24 hours
- [ ] After deploy: `/health` returns 200, sign-in works, and dashboard figures match the previous day
- [ ] Spot-check one finalized settlement and one report export

**Rollback:** in Render, redeploy the previous successful deploy. Migrations are forward
only. If a migration must be reversed, restore to a point in time before the deploy, or
ship a corrective migration.

## 10. Troubleshooting

| Symptom                                                       | Cause / fix                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Build fails at `prisma migrate deploy` with `SUPER privilege` | Set `log_bin_trust_function_creators = 1` on the database (step 1.3)                                 |
| API exits at start: `Invalid environment configuration`       | Read the listed variables; production guards reject HTTP origins and placeholder secrets             |
| Sign-in succeeds but every call returns 401                   | SPA is calling the Render URL directly. Keep `VITE_API_BASE_URL=/api` and the Vercel rewrite         |
| `403 CSRF_HEADER_MISSING`                                     | A client other than the SPA must send `X-Requested-With: XMLHttpRequest`                             |
| Document download returns 404 `FILE_MISSING`                  | Bucket settings changed or the object was deleted outside the app. Restore it from bucket versioning |
| `/health` returns 503                                         | Database unreachable: check TLS parameters, IP allow-list and credentials                            |
