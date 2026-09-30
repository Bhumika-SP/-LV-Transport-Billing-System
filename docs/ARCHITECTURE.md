# Architecture & Decisions

## Stack

| Layer          | Choice                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Frontend       | React 19, Vite, Tailwind CSS v4, React Router, TanStack Query, Axios, React Hook Form + Zod, Recharts, Lucide |
| Backend        | Node.js 22, Express 5, Zod validation, Pino logging, Helmet, CORS                                             |
| Database       | MySQL 8, Prisma ORM **6.x**                                                                                   |
| Auth (Phase 2) | JWT in HTTP-only, Secure cookies; password hashing with argon2id                                              |
| Hosting        | Frontend on Vercel, API on Render, managed MySQL, S3-compatible private object storage                        |

**Why Prisma 6 and not 7:** Prisma 7 requires driver adapters and a new config
layout, and Prisma 8 is only a release candidate. Prisma 6 is stable, fully
supports MySQL `DECIMAL`, and can be upgraded later without changing the schema.

## Backend layering

```
routes → controllers → services (business rules) → Prisma → MySQL
```

- `src/modules/<feature>/` holds `*.routes.js`, `*.controller.js`, `*.service.js`, `*.schemas.js`.
- Business formulas live **only** in services. For example, the settlement formula is in one
  place (`settlement.service.js`, Phase 9) and every screen and report reads its stored output.
- Errors are thrown as `AppError` and rendered by one handler:
  `{ success: false, message, code, details?, requestId }`. Stack traces are never
  returned in production.
- Success responses: `{ success: true, data, meta? }`.

## Data conventions

### Money

- `DECIMAL(15,2)` in MySQL, `Prisma.Decimal` (decimal.js) in Node. Never use JS `number` arithmetic on money.
- The API serializes money as **strings** (`"2500000.00"`).
- The frontend formats the string directly (`formatINR` → `₹25,00,000.00`) without converting to float.

### Dates, times and timezone

- Business timezone: **Asia/Kolkata**.
- Event timestamps (`created_at`, logins, audit) are stored as UTC `DATETIME` and displayed in IST.
- Business dates (trip date, expense date, payment date, received date) are stored as
  MySQL `DATE`. They are calendar dates with no time and no timezone, so the browser
  timezone cannot shift them. The API accepts and returns them as `YYYY-MM-DD`.
- Settlement months are stored as `CHAR(7)` `YYYY-MM`. A trip's month is derived from its
  `DATE` by string, so the result is deterministic.
- "Today" on the server is computed in Asia/Kolkata, not in server local time.

## Security baseline

- Helmet headers, `x-powered-by` disabled, JSON body limit 1 MB.
- CORS allow-list from `CORS_ORIGINS` with credentials.
- Request IDs (`x-request-id`) on every response and log line.
- Cookie, authorization and password fields are redacted from logs.
- Secrets only in environment variables. `.env` is git-ignored.

## Production topology

Recommended: **Vercel rewrites `/api/*` to the Render service** (see `frontend/vercel.json`).
The browser then talks to a single origin, so the auth cookie is first-party
(`SameSite=Lax`, `Secure`, `HttpOnly`). This avoids third-party-cookie blocking that
would break a cross-site setup where the frontend is on `*.vercel.app` and the API on
`*.onrender.com`.

- Backups: use the managed MySQL provider's automated daily backups plus point-in-time recovery.
- Logs: Pino JSON to stdout, collected by Render's log stream.
- Documents: private S3-compatible bucket (e.g. Cloudflare R2 / AWS S3), served
  through an authorized backend download endpoint. A local-disk driver is used in development.

## Assumptions (documented per spec instruction)

| #   | Topic                                         | Assumption                                                                                                                                                                                                                                                                                                                                                                                  | Status                             |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A1  | User ↔ role                                   | Each user has exactly one of the three roles.                                                                                                                                                                                                                                                                                                                                               | Decided                            |
| A2  | Settlement status                             | Workflow status (`DRAFT`…`FINALIZED`) and payment status (`UNPAID`/`PARTIALLY_PAID`/`PAID`) are two columns, because payment status only applies after finalization.                                                                                                                                                                                                                        | Decided                            |
| A3  | LV Expenses screen                            | LV-paid expenses live in `driver_expenses` with `paid_by = LV`. A separate table would duplicate data.                                                                                                                                                                                                                                                                                      | Decided                            |
| A4  | Assignments                                   | Vehicle → company and driver → vehicle are separate dated histories.                                                                                                                                                                                                                                                                                                                        | Decided                            |
| A5  | Import company consistency                    | A trip whose vehicle is not assigned to the import's company on the trip date is a **warning**, not an error.                                                                                                                                                                                                                                                                               | Decided, configurable              |
| A6  | Profit month basis                            | Profit for month M = company settlements for `settlement_month = M` (RECEIVED) minus finalized driver settlements for `settlement_month = M`. It is not based on cash date.                                                                                                                                                                                                                 | Decided                            |
| A7  | Company-wise allocation of driver settlements | **Open.** A driver settlement is per driver per month, but a driver may serve more than one company in a month. Proposed default: allocate each finalized settlement across companies in proportion to that driver's trip earnings per company that month, with exact paise rounding. The method is stored as a setting so it can change. Overall and monthly profit do not depend on this. | Needs confirmation before Phase 11 |
| A8  | Advance recovery amount                       | The biller enters the recovery amount for the month while preparing the settlement. It is capped at the outstanding balance. There is no automatic schedule.                                                                                                                                                                                                                                | Decided, configurable later        |
