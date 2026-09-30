# Security and production hardening (Phase 18)

This is the Phase 18 review of every area the spec lists. Each finding is either
**verified** (with the test or file that proves it) or **fixed**.

## Summary of Phase 18 changes

| Area             | Change                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request IDs      | **Fixed.** An upstream `X-Request-ID` is reused only if it matches `[A-Za-z0-9_.-]{1,64}`. A longer header used to overflow `audit_logs.request_id` and would have failed every audited write. |
| Caching          | Every `/api` response is `Cache-Control: no-store`, so financial data is never kept by browsers or proxies.                                                                                    |
| Compression      | `compression` middleware for API responses.                                                                                                                                                    |
| Environment      | Production refuses to start with non-HTTPS or localhost `CORS_ORIGINS`, or a placeholder or low-entropy `JWT_SECRET`.                                                                          |
| Authorization    | `requirePermission` guards are introspectable. The route inventory test fails if any route has neither a permission guard nor a documented exception.                                          |
| Frontend         | Route-level code splitting: first load went from 1.14 MB to about 300 KB (92 KB gzipped); vendor chunks cache across deploys.                                                                  |
| Frontend headers | `vercel.json` sets a strict CSP (`'self'` only, `frame-ancestors 'none'`), HSTS, nosniff, `X-Frame-Options: DENY`, referrer and permissions policies, immutable asset caching.                 |
| Dependencies     | `csv-parse` upgraded to v7 (advisory GHSA for the `columns` option). Remaining advisories assessed below.                                                                                      |

## Authentication and sessions (verified)

- Passwords are hashed with **argon2id**. The policy (`PASSWORD_RULE`) requires at least 10 characters.
- The session is a JWT in an **HTTP-only** cookie (`lv_session`). It is `Secure` in production (forced), and `SameSite` is configurable (`lax` by default).
- The session is revoked when the password changes, a password is reset, the role changes or the user is deactivated. Each request re-checks the user's status and `tokenVersion`.
- Login is rate limited (`LOGIN_RATE_LIMIT_*`). Failed logins are audited, and the audit dashboard alerts on them.
- **CSRF:** every state-changing request needs `X-Requested-With: XMLHttpRequest`, which cross-site requests cannot set without a preflight that the CORS allow-list rejects. This is proven for every write route in `route-inventory.test.js`.

## Authorization (verified)

- The backend authorizes by **permission code**, never by role name. The matrix lives in `backend/src/config/permissions.js` and is synced to the database at startup.
- `route-inventory.test.js` discovers all API routes and checks three things:
  1. Every non-public route returns **401** to anonymous callers. Only `POST /api/auth/login` and `GET /api/` are public.
  2. Every write route rejects a missing CSRF header.
  3. Every route has a `requirePermission` guard, or is on a short documented exception list:
     - own-profile and own-notification routes;
     - the dashboard and reports, which filter by permission inside the service;
     - documents, which check the owning record's permission.
- Row-level rules:
  - Notifications are scoped to their owner (another user's notification returns 404).
  - A document is visible exactly to the roles that can see its record.
- Frontend navigation mirrors the backend matrix. `navigation.test.js` compares the two permission lists, so they cannot drift. The UI is convenience only; the API enforces everything.

## Data integrity and auditability (verified)

- Money is `DECIMAL(15,2)` calculated with decimal.js; floats never touch amounts.
- Every financial write runs in a transaction with row locks (`SELECT … FOR UPDATE`, READ COMMITTED) wherever a check is followed by a write:
  - overlap checks;
  - settlement month locks;
  - payment outstanding checks;
  - advance recovery.
- Finalized settlements are immutable until a reasoned reopen, which snapshots a revision.
- `audit_logs` is append-only at three levels:
  - no API modifies it;
  - database triggers reject `UPDATE` and `DELETE`;
  - `audit.test.js` proves both.

## Input handling (verified)

- Every request body, query and route parameter is validated with Zod. Unknown enum values, malformed dates and over-precise amounts are rejected with field-level errors.
- JSON bodies are limited to 1 MB.
- Uploads are handled in memory with size limits: imports 10 MB, documents 10 MB.
- Document types are verified by magic bytes, and storage keys are generated on the server. Downloads send `nosniff` and `no-store`.
- CSV exports neutralise formula injection (`=`, `+`, `-`, `@` prefixes).
- Error responses never include stack traces or SQL. Unknown errors are logged with the request ID and returned as a generic 500.

## Logging (verified)

- Logs are structured JSON (Pino) on stdout in production, with a request ID on every line and in the `X-Request-ID` response header.
- Cookies, authorization headers and password fields are redacted.
- Health checks are not logged. `/health` returns 503 when the database is unreachable.

## Database indexes (reviewed)

Every list and report query was checked against the schema. The composite indexes cover:

- trips: company, driver and vehicle by date; settlement month + driver; import;
- driver items: driver + settlement month;
- settlements: unique driver + month; month + status;
- payments: settlement + status; driver + date;
- company settlements: unique company + month;
- GST: period + direction + status;
- audit: entity, user, action, created;
- notifications: user + read + id;
- documents: entity + deleted.

No missing index was found for the current query patterns. Revisit if the slow-query log shows otherwise; enable it on the managed database at `long_query_time = 1`.

## Performance (reviewed)

- All lists are paginated server-side (maximum 100 rows per page). Reports cap at 50,000 rows.
- Heavy aggregations (settlement engine, profit, GST summaries) run as grouped queries, not per-row round trips.
- The frontend loads pages on demand, and TanStack Query caches and deduplicates requests.
- **Connection pool:** Prisma defaults to `num_cpus × 2 + 1` connections. On a small managed MySQL plan, set `?connection_limit=5` in `DATABASE_URL`.

## Responsive UI (reviewed)

- The layout uses a collapsible sidebar below `lg`.
- Toolbars stack on small screens.
- Tables scroll horizontally inside their card; the page itself never scrolls sideways.
- Modals fit the viewport.
- The notification dropdown is capped at `100vw − 2rem`.

## File storage (verified)

- Files are private. There are no public URLs; every download is authorized and streamed by the API.
- S3 objects are written with server-side encryption. The local driver refuses keys that would escape its root directory.
- Removal is a soft delete, so the file is kept for audit.

## Backups and recovery

| What          | How                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MySQL         | Provider automated daily backups with point-in-time recovery (7+ days retention). Also a weekly logical dump: `mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF lv_billing \| gzip > lv_billing-$(date +%F).sql.gz`, stored off-provider and encrypted. |
| Documents     | Enable **bucket versioning** (R2/S3) and a lifecycle rule for non-current versions. For `local` storage, include `STORAGE_DIR` in server backups.                                                                                                                                 |
| Configuration | Environment variables are held in Render/Vercel; keep an offline copy of production secrets in the company password manager.                                                                                                                                                      |
| Restore drill | Before go-live and then quarterly: restore the latest dump into a scratch database, run `npx prisma migrate status` against it, start the API against it and check that `/health` and a finalized settlement's figures match production.                                          |

`--triggers` matters: the dump must include the audit append-only triggers.

## Dependency advisories (`npm audit --omit=dev`, 1 Oct 2026)

| Package                   | Advisory                                       | Assessment                                                                                                                                               |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csv-parse`               | Prototype replacement via the `columns` option | **Fixed:** upgraded to v7. The app never used `columns`.                                                                                                 |
| `prisma` → `deepmerge-ts` | Stack exhaustion on recursive objects          | Affects the Prisma CLI's config loading at migrate time, not request handling. The only "fix" is a downgrade. Accepted; re-check on each Prisma upgrade. |
| `exceljs` → `uuid`        | Buffer bounds check in v3/v5/v6 with `buf`     | exceljs does not call those functions with a caller buffer. Accepted; re-check on each exceljs release.                                                  |

Run `npm audit --omit=dev` before every release and record new findings here.
