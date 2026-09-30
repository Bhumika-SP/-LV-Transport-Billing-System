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
- **Field naming convention.** The serializer relies on it (`src/utils/serialize.js`):
  - `*At` fields are timestamps and are sent as full ISO strings.
  - `*Date`, `effectiveFrom` and `effectiveTo` fields are business dates and are sent as `YYYY-MM-DD`.
  - New date columns must follow this naming.

### Shared building blocks (Phase 1)

| Concern            | Location                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Request validation | `middleware/validate.js`. Parsed values are on `req.valid.{params,query,body}`                                           |
| Common Zod types   | `validation/common.js`: ids, dates, months, amounts, list query                                                          |
| Money arithmetic   | `utils/money.js`: decimal.js, rounded half-up to paise                                                                   |
| Date helpers       | `utils/dates.js`: parse, add days, month bounds, today in IST                                                            |
| Response envelope  | `utils/response.js`: `ok`, `created`, `paged`, all serialized                                                            |
| Frontend UI kit    | `frontend/src/components/ui/*`: Button, Field, Modal, ConfirmDialog, DataTable, Pagination, Tabs, Badge, States, Toolbar |
| List state in URL  | `frontend/src/hooks/useListParams.js`                                                                                    |

## Testing

- **Unit tests** (`backend/tests/unit`) mock the database.
- **Integration tests** (`backend/tests/integration`) run against a real MySQL database
  set by `backend/.env.test`. The database name **must end in `_test`**; the harness
  refuses anything else because it truncates tables. Migrations are applied
  automatically before the suite runs. Test files run one at a time.

## Authentication & RBAC (Phase 2)

- **Sessions:** HS256 JWT (`sub` = user id, `tv` = token version) in the HTTP-only cookie `lv_session`, with `SameSite=Lax`, `Secure` in production, and an 8 h default lifetime.
- **Revocation:** `users.token_version` is compared on every request. Password change or reset and deactivation increment it, which ends existing sessions immediately.
- **Per-request reload:** the user, role and permissions are re-read from the database on each request, so role changes apply at once.
- **Passwords:** argon2id (19 MiB memory, t=2, p=1), minimum 10 characters. Unknown emails are verified against a dummy hash to equalize timing.
- **RBAC:** routes call `requirePermission('<code>')` and never check role names. The matrix lives in `backend/src/config/permissions.js` and is synced to the DB by `npm run db:seed`. It is added to phase by phase.
- **CSRF:** SameSite cookie plus a required `X-Requested-With` header on mutating requests.
- **Brute force:** login is rate-limited per IP (10 per 15 min by default).
- **Audit:** `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, user `CREATE`/`UPDATE`/`STATUS_CHANGE`/`ROLE_CHANGE` are written to `audit_logs` inside the same transaction as the change.
- **Frontend:** `AuthProvider` (from `/auth/me`), `RequireAuth` and `RequireAccess` guards, and navigation filtered by `permission`/`roles`. A 401 anywhere drops the session. All of this is UX only; the API is the authority.

## RBAC sync at startup

The API syncs `roles` / `permissions` / `role_permissions` from `src/config/permissions.js` every
time it starts (idempotent). A deploy that adds permissions can never run with a stale matrix.
`npm run db:seed` does the same.

## Concurrency

Rules that span rows (no overlapping rates or assignments, and later balances and
payment limits) are enforced in services. The service locks the parent row
(`SELECT … FOR UPDATE` via `lockRow`) **before any read**, and runs the transaction
with `LOCKING_TX` (READ COMMITTED). This makes reads after the lock see rows committed
by the previous lock holder. Tests fire concurrent requests and assert that exactly one
succeeds.

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

| #   | Topic                                         | Assumption                                                                                                                                                                                                                                                                                                                                                                                  | Status                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A1  | User ↔ role                                   | Each user has exactly one of the three roles.                                                                                                                                                                                                                                                                                                                                               | Decided                                     |
| A2  | Settlement status                             | Workflow status (`DRAFT`…`FINALIZED`) and payment status (`UNPAID`/`PARTIALLY_PAID`/`PAID`) are two columns, because payment status only applies after finalization.                                                                                                                                                                                                                        | Decided                                     |
| A3  | LV Expenses screen                            | LV-paid expenses live in `driver_expenses` with `paid_by = LV`. A separate table would duplicate data.                                                                                                                                                                                                                                                                                      | Decided                                     |
| A4  | Assignments                                   | Vehicle → company and driver → vehicle are separate dated histories.                                                                                                                                                                                                                                                                                                                        | Decided                                     |
| A5  | Import company consistency                    | A trip whose vehicle is not assigned to the import's company on the trip date is a **warning**, not an error.                                                                                                                                                                                                                                                                               | Decided, configurable                       |
| A6  | Profit month basis                            | Profit for month M = company settlements for `settlement_month = M` (RECEIVED) minus finalized driver settlements for `settlement_month = M`. It is not based on cash date.                                                                                                                                                                                                                 | Decided                                     |
| A7  | Company-wise allocation of driver settlements | **Open.** A driver settlement is per driver per month, but a driver may serve more than one company in a month. Proposed default: allocate each finalized settlement across companies in proportion to that driver's trip earnings per company that month, with exact paise rounding. The method is stored as a setting so it can change. Overall and monthly profit do not depend on this. | Needs confirmation before Phase 11          |
| A8  | Advance recovery amount                       | The biller enters the recovery amount for the month while preparing the settlement. It is capped at the outstanding balance. There is no automatic schedule.                                                                                                                                                                                                                                | Decided, configurable later                 |
| A9  | Rate management                               | Adding or cancelling vehicle-type rates changes trip earnings, so it is **Admin only** (`rate.manage`). Billers manage vehicles and types (§8 "create/edit vehicles").                                                                                                                                                                                                                      | Decided, easy to change in `permissions.js` |
| A10 | Roles screen                                  | The three roles and their permission matrix are defined in code and shown read-only. There is no custom role editor in V1 (spec: exactly three roles).                                                                                                                                                                                                                                      | Decided                                     |
| A11 | Vehicle Types navigation                      | "Vehicle Types" (with rate history) gets its own Operations menu entry, because §13 requires types to be maintained separately.                                                                                                                                                                                                                                                             | Decided                                     |
| A12 | Concurrent assignments                        | Not specified. Three **settings**, each defaulting to _no overlap_: vehicle↔several companies, driver↔several vehicles, vehicle↔several drivers (e.g. shift drivers). Admin can change them on the Settings page.                                                                                                                                                                           | Configurable                                |
| A13 | Identity uniqueness                           | Company **name** is unique (code optional but unique). Driver **licence number** is unique when given. Driver phone is not unique. Vehicle **registration** is unique after normalization (upper-case, no spaces or hyphens).                                                                                                                                                               | Decided                                     |
| A14 | Rate supersession                             | Only a new **open-ended** rate closes the previous open-ended rate. A bounded rate overlapping an active rate is rejected rather than split, so no silent gaps appear.                                                                                                                                                                                                                      | Decided                                     |
| A15 | Deletion                                      | Master data is never hard-deleted. It is deactivated, so history and reports stay intact.                                                                                                                                                                                                                                                                                                   | Decided                                     |
| A16 | Company settlement details                    | Expected and received amounts must be > 0. Received date cannot be in the future (IST). Reference number is optional for every method (spec: "where applicable"). Settlements can be recorded for inactive companies (historical months).                                                                                                                                                   | Decided                                     |
| A17 | Correcting receipts                           | Company settlements have no finalization step in the spec. After RECEIVED, only Admin can correct or revert, always with a reason and a full audit trail. There is no silent overwrite.                                                                                                                                                                                                     | Decided                                     |
| A18 | Trip edits and recalculation                  | Edits keep the stored rate unless the date or vehicle changes. Recalculation re-reads the vehicle's **current** type (so a corrected vehicle type can be applied) and the rate effective on the trip date.                                                                                                                                                                                  | Decided                                     |
| A19 | Cancelling a used rate                        | Allowed (to fix entry errors). Trips priced with it keep their stored values, and the API reports how many, so an admin can recalculate explicitly.                                                                                                                                                                                                                                         | Decided                                     |
| A20 | Trip data rules                               | Trip date cannot be in the future. Zero KM is allowed (only negatives are forbidden). Inactive company, driver or vehicle on a trip is a warning, not an error, so historical entries can be caught up.                                                                                                                                                                                     | Decided                                     |
| A21 | Import limits and rules                       | 5 MB / 5,000 rows per file. The first non-empty row is the header. ISO dates are always accepted besides the template format. Warning rows are imported unless excluded at confirm. A row whose duplicate key needs an external trip ID that is blank is imported with a "duplicate check skipped" warning.                                                                                 | Decided, limits configurable in code        |
