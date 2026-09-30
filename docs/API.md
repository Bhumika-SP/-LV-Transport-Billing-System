# API Reference

REST API served by `backend/`. All application endpoints are under `/api`. This
document grows with each phase.

## Conventions

**Success**

```json
{ "success": true, "data": {}, "meta": { "page": 1, "pageSize": 25, "total": 120 } }
```

`meta` is present on paginated lists only.

**Error**

```json
{
  "success": false,
  "message": "Driver not found",
  "code": "DRIVER_NOT_FOUND",
  "details": [],
  "requestId": "…"
}
```

- `code` is stable and machine-readable, and `message` is suitable for display.
- `details` carries field-level validation issues (`[{ path, message }]`).
- Stack traces are never returned in production.

**Other conventions**

- Money is sent as decimal **strings** (`"2500000.00"`), never as JSON numbers.
- Dates are `YYYY-MM-DD` and months are `YYYY-MM`, in business time (Asia/Kolkata).
- Every response carries an `x-request-id` header. A client-supplied one is echoed back.
- **Auth:** session JWT in the HTTP-only cookie `lv_session` (8 h default). Clients must send credentials.
- **CSRF:** every non-GET `/api` request must include `X-Requested-With: XMLHttpRequest`, otherwise it gets 403 `CSRF_HEADER_MISSING`.
- **List endpoints** accept `page`, `pageSize` (max 100), `search`, `sortBy`, `sortDir` (`asc`/`desc`) and return `meta: { page, pageSize, total, totalPages }`.

### Standard error codes

| HTTP | Code                                                          | When                                                           |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                                            | Request failed schema validation                               |
| 400  | `INVALID_JSON`                                                | Malformed JSON body                                            |
| 400  | `INVALID_REFERENCE`                                           | Foreign key target does not exist                              |
| 401  | `UNAUTHORIZED`                                                | Not signed in                                                  |
| 401  | `INVALID_CREDENTIALS` / `SESSION_EXPIRED`                     | Login failed, or session revoked/expired                       |
| 403  | `FORBIDDEN`                                                   | Signed in but not permitted                                    |
| 403  | `ACCOUNT_INACTIVE` / `CSRF_HEADER_MISSING`                    | Deactivated account, or missing CSRF header                    |
| 429  | `TOO_MANY_REQUESTS`                                           | Login rate limit exceeded (10 per 15 min per IP, configurable) |
| 404  | `ROUTE_NOT_FOUND` / `RECORD_NOT_FOUND` / `<ENTITY>_NOT_FOUND` | Unknown route or record                                        |
| 409  | `DUPLICATE_RECORD` / domain-specific                          | Unique rule violated                                           |
| 413  | `PAYLOAD_TOO_LARGE`                                           | Body over limit (1 MB JSON)                                    |
| 500  | `INTERNAL_ERROR`                                              | Unexpected error                                               |
| 503  | `DATABASE_UNAVAILABLE`                                        | Database unreachable                                           |

## Endpoints

### System

| Method | Path      | Auth   | Description                                                                                                 |
| ------ | --------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/health` | Public | Liveness and DB check. 200 `{status:"ok", database:{status:"up", latencyMs}}` or 503 `DATABASE_UNAVAILABLE` |
| GET    | `/api`    | Public | API name and version                                                                                        |

### Auth — `/api/auth`

| Method | Path                    | Auth                 | Body / notes                                                                                                      |
| ------ | ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Public, rate-limited | `{ email, password }` → user with `role` and `permissions[]`. Sets the cookie. Audited (`LOGIN` / `LOGIN_FAILED`) |
| POST   | `/auth/logout`          | Session              | Clears the cookie. Audited                                                                                        |
| GET    | `/auth/me`              | Session              | Current user, role and permission codes                                                                           |
| POST   | `/auth/change-password` | Session              | `{ currentPassword, newPassword }` (min 10). Revokes other sessions and re-issues this one                        |

### Users — `/api/users` (`user.manage`, Admin only)

| Method | Path                        | Body / notes                                                                                                                                                                                                                                           |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/users`                    | Filters: `search` (name/email), `role`, `status`. Sort: `name`, `email`, `createdAt`, `lastLoginAt`                                                                                                                                                    |
| POST   | `/users`                    | `{ name, email, roleCode, password }`. 409 `EMAIL_TAKEN`                                                                                                                                                                                               |
| GET    | `/users/:id`                |                                                                                                                                                                                                                                                        |
| PATCH  | `/users/:id`                | Any of `{ name, email, roleCode, status }`. Role change is audited as `ROLE_CHANGE`. Deactivation revokes sessions. You cannot change your own role or status (`SELF_MODIFICATION_NOT_ALLOWED`), and the last active admin is protected (`LAST_ADMIN`) |
| POST   | `/users/:id/reset-password` | `{ password }`. Revokes the user's sessions. Audited                                                                                                                                                                                                   |

### Roles — `/api/roles` (`role.view`, Admin only)

| Method | Path     | Notes                                                                                                                               |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/roles` | `{ roles: [{ code, name, description, userCount, permissions[] }], permissions: [{ code, module, description }] }`. Read-only in V1 |

### Settings — `/api/settings` (`settings.manage`, Admin only)

| Method | Path             | Notes                                                                        |
| ------ | ---------------- | ---------------------------------------------------------------------------- |
| GET    | `/settings`      | All configurable rules: `key, group, type, description, defaultValue, value` |
| PATCH  | `/settings/:key` | `{ value }` (type-checked). Audited with previous and new value              |

### Master data (Phase 3)

All GETs need `master.view` (all roles). Writes need the permission in brackets. Every
resource has `GET /<resource>/options` (active only, or `?includeInactive=true`) for dropdowns.
Create, update and status changes are audited. Status is changed with `PATCH { status: "INACTIVE" }`,
and records are never deleted.

| Method       | Path                                         | Notes                                                                                                                                                          |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/companies`                                 | `search` (name, code, contact, GSTIN, phone), `status`. Sort `name`, `code`, `createdAt`, `status`                                                             |
| POST / PATCH | `/companies`, `/companies/:id`               | [`company.manage`] `name`* (unique), `code` (unique, upper-cased), `contactPerson`, `phone`, `email`, `address`, `gstin` (validated), `notes`, `status`        |
| GET          | `/companies/:id`                             | Adds `currentVehicleCount`                                                                                                                                     |
| GET          | `/companies/:id/vehicles`                    | Vehicle-assignment history, each with `periodStatus` (CURRENT/UPCOMING/ENDED)                                                                                  |
| GET          | `/companies/:id/drivers`                     | Drivers derived from driver-assignments overlapping this company's vehicle-assignments (period = intersection)                                                 |
| GET          | `/drivers`                                   | `search` (name, code, phone, licence), `status`. Bank account masked (`••••9012`)                                                                              |
| POST / PATCH | `/drivers`, `/drivers/:id`                   | [`driver.manage`] `fullName`_, `phone`_, `driverCode` (auto `DRV-0001` if blank), `licenseNumber` (unique), dates as `YYYY-MM-DD`, bank/IFSC/UPI (validated)   |
| GET          | `/drivers/:id`, `/drivers/:id/assignments`   | Detail (unmasked, with `currentVehicle`) and assignment history                                                                                                |
| GET          | `/vehicle-types`                             | Each with `currentRate` (today, IST) and `vehicleCount`                                                                                                        |
| POST / PATCH | `/vehicle-types`, `/vehicle-types/:id`       | [`vehicle.manage`] `name`* (unique), `description`, `status`                                                                                                   |
| GET          | `/vehicles`                                  | `search` (registration, make, model), `status`, `vehicleTypeId`, `companyId` (current assignment). Each with `currentCompany`, `currentDriver`                 |
| POST / PATCH | `/vehicles`, `/vehicles/:id`                 | [`vehicle.manage`] `registrationNumber`* (normalized, unique), `vehicleTypeId`*, make/model/year/`fuelType`, insurance/fitness/permit numbers and expiry dates |
| GET          | `/vehicles/:id`, `/vehicles/:id/assignments` | Detail with `currentCompany`, `currentDriver`, `currentRate`, and `{ companies[], drivers[] }` history                                                         |

### Rates — `/api/rates` (append-only)

| Method | Path                                            | Notes                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/rates?vehicleTypeId=`                         | Full history, including cancelled rows                                                                                                                                                                                           |
| GET    | `/rates/resolve?vehicleTypeId=&date=YYYY-MM-DD` | The ACTIVE rate effective on that date, or `null`                                                                                                                                                                                |
| POST   | `/rates`                                        | [`rate.manage`, Admin] `{ vehicleTypeId, ratePerKm, effectiveFrom, effectiveTo?, notes? }` → `{ rate, closedPrevious }`. A new open-ended rate closes the previous open-ended one. Any other overlap → 409 `RATE_PERIOD_OVERLAP` |
| POST   | `/rates/:id/cancel`                             | [`rate.manage`] `{ reason }`. Row kept with status `CANCELLED`. There is no PATCH/DELETE                                                                                                                                         |

### Assignments — `/api/assignments`

| Method | Path                                            | Notes                                                                                                                                                       |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/assignments/vehicles`                         | Vehicle → company. Filters `vehicleId`, `companyId`, `current=true`. Sort `startDate` (desc default)                                                        |
| GET    | `/assignments/drivers`                          | Driver → vehicle. Filters `driverId`, `vehicleId`, `current=true`                                                                                           |
| POST   | `/assignments/vehicles`, `/assignments/drivers` | [`assignment.manage`] parties plus `startDate`*, `endDate`, `notes`. Parties must be ACTIVE. Overlaps → 409 `ASSIGNMENT_OVERLAP` unless allowed by settings |
| PATCH  | `/assignments/{vehicles,drivers}/:id`           | Change dates/notes, or end the assignment by setting `endDate`. Parties are immutable                                                                       |

### Company settlements — `/api/company-settlements` (Phase 4)

View: `company_settlement.view` (all roles). Record: `company_settlement.manage` (Admin, Biller).
Correct: `company_settlement.correct` (Admin). Every change is audited. Payment method is one of
`CASH | BANK_TRANSFER | UPI | CHEQUE`.

| Method | Path                               | Notes                                                                                                                                                                                                                                      |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/company-settlements`             | Filters `companyId`, `status` (PENDING/RECEIVED), `month`, or `fromMonth`/`toMonth`. Sort `settlementMonth` (desc), `expectedAmount`, `receivedAmount`, `receivedDate`. Each row has `variance` = received − expected (null while pending) |
| GET    | `/company-settlements/summary`     | Same filters → `expectedTotal` (all), **`receivedTotal` (RECEIVED only, actual amounts)**, `pendingTotal` (PENDING expected), plus counts                                                                                                  |
| POST   | `/company-settlements`             | [manage] `{ companyId, settlementMonth: "YYYY-MM", expectedAmount, notes? }` → PENDING. 409 if the company already has that month                                                                                                          |
| PATCH  | `/company-settlements/:id`         | [manage] PENDING only: `{ expectedAmount?, notes? }`                                                                                                                                                                                       |
| POST   | `/company-settlements/:id/receive` | [manage] PENDING → RECEIVED: `{ receivedAmount, receivedDate (not future), paymentMethod, referenceNumber?, notes? }`                                                                                                                      |
| POST   | `/company-settlements/:id/correct` | [correct] RECEIVED only: any of expected/received amount, date, method, reference, notes, plus **`reason`**                                                                                                                                |
| POST   | `/company-settlements/:id/revert`  | [correct] RECEIVED → PENDING, clears receipt fields. `{ reason }`                                                                                                                                                                          |
| DELETE | `/company-settlements/:id`         | [correct] PENDING only. `{ reason }`. RECEIVED settlements cannot be deleted                                                                                                                                                               |

### Trips — `/api/trips` (Phase 5)

View: `trip.view` (all roles). Create/edit/cancel/preview: `trip.manage` (Admin, Biller).
Recalculate: `trip.recalculate` (Admin).

Trip body: `{ companyId, driverId, vehicleId, tripDate, kmSource: "START_END"|"DIRECT", startKm, endKm | totalKm, externalTripId?, tripReference?, pickup?, dropLocation?, notes? }`.

| Method | Path                     | Notes                                                                                                                                                                                                                        |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/trips`                 | Filters `search` (external ID, reference, pickup, drop), `companyId`, `driverId`, `vehicleId`, `vehicleTypeId`, `status`, `source`, `month`, `fromDate`/`toDate`. Sort `tripDate` (desc), `totalKm`, `earnings`, `createdAt` |
| GET    | `/trips/summary`         | Same filters → `{ tripCount, totalKm, totalEarnings }` over **ACTIVE** trips only                                                                                                                                            |
| POST   | `/trips/preview`         | Trip body → `{ vehicleType, rate, totalKm, earnings, warnings }`. Nothing is saved; used by the entry form                                                                                                                   |
| POST   | `/trips`                 | → `{ trip, warnings }`. 422 `RATE_NOT_FOUND` if no rate on the trip date. 409 on a duplicate `externalTripId` for the company. 400 for bad KM (`endKm` < `startKm`, negative) or a future date                               |
| GET    | `/trips/:id`             | Includes the rate row used (`rate`), and created/updated/cancelled by                                                                                                                                                        |
| PATCH  | `/trips/:id`             | ACTIVE only. The stored rate is kept unless `tripDate` or `vehicleId` changes, in which case the rate for the new date applies                                                                                               |
| POST   | `/trips/:id/cancel`      | `{ reason }`. Kept for history and excluded from totals                                                                                                                                                                      |
| POST   | `/trips/:id/recalculate` | [Admin] `{ reason }`. Re-applies the rate effective on the trip date → `{ trip, changed }`. Audited `RECALCULATE` with old and new values                                                                                    |
| POST   | `/trips/recalculate`     | [Admin] `{ vehicleTypeId, fromDate, toDate, companyId?, reason }` → `{ examined, changed, unchanged }`. All-or-nothing                                                                                                       |

Rate responses: `POST /rates` also returns `tripsOnPreviousRate` (trips dated on/after the new rate still
priced with the superseded one). `POST /rates/:id/cancel` returns `{ rate, tripsUsingRate }`.

### Bulk import — `/api/import-templates`, `/api/trip-imports` (Phase 6)

View: `import.view` (all roles). Everything else: `trip.import` (Admin, Biller). Uploads are
`multipart/form-data` with a `file` field: `.xlsx` or `.csv`, max 5 MB, max 5,000 data rows. The type
is verified from the file bytes, not the name alone.

| Method       | Path                                            | Notes                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/import-templates/meta`                        | Target fields, date formats, driver-match options, duplicate-key fields                                                                                                                               |
| GET          | `/import-templates?companyId=&includeInactive=` | Templates with `mappings: { targetField: "Column header" }`                                                                                                                                           |
| POST / PATCH | `/import-templates`, `/import-templates/:id`    | `{ companyId, name, dateFormat, kmMode, driverMatchField, duplicateKey[], keepUnmapped, mappings }`. Required fields for the KM mode and the duplicate-key fields must be mapped                      |
| POST         | `/trip-imports/inspect`                         | file → `{ headers, rowCount, sampleRows }`. Nothing stored                                                                                                                                            |
| POST         | `/trip-imports`                                 | file + `companyId` + `templateId` → VALIDATED batch with counts (`totalRows, validRows, warningRows, errorRows, duplicateRows`). No trips created. 400 `MISSING_COLUMNS` if mapped headers are absent |
| GET          | `/trip-imports`, `/trip-imports/:id`            | History (filters `companyId`, `status`) and batch summary                                                                                                                                             |
| GET          | `/trip-imports/:id/rows?status=`                | Row-level results: `raw`, `normalized` (incl. computed earnings), `messages[{level, field, message}]`, `tripId`                                                                                       |
| GET          | `/trip-imports/:id/errors.csv?includeWarnings=` | Problem rows with row number, status, messages and original values (UTF-8 BOM; formula-injection safe)                                                                                                |
| POST         | `/trip-imports/:id/confirm`                     | `{ includeWarnings: true }`. Re-validates, then imports all importable rows in **one transaction** (company-locked). Unexpected failure → nothing saved, batch `FAILED`, 500 `IMPORT_FAILED`          |
| POST         | `/trip-imports/:id/discard`                     | VALIDATED → DISCARDED                                                                                                                                                                                 |

### Driver line items — `/api/earnings`, `/api/adjustments` (Phase 7)

View: `driver_finance.view` (all roles). Write: `earning.manage` / `adjustment.manage` (Admin, Biller).
Every line-item resource (later also `/api/driver-expenses`) has the same shape:

| Method | Path                   | Notes                                                                                                                                          |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/<resource>`          | Filters `driverId`, `month` (settlement month), `type`, `status` (ACTIVE/VOID), `fromDate`/`toDate`. Sort `date` (desc), `amount`, `createdAt` |
| GET    | `/<resource>/totals`   | Same filters → `[{ type, count, amount }]` over ACTIVE items                                                                                   |
| POST   | `/<resource>`          | Create. `amount` > 0. `settlementMonth` defaults to the month of the item date                                                                 |
| POST   | `/<resource>/:id/void` | `{ reason }`. Kept for history, excluded from totals. Never deleted                                                                            |

- `POST /earnings`: `{ driverId, type: ALLOWANCE|OTHER_EARNING, amount, earningDate, settlementMonth?, description }`
- `POST /adjustments`: `{ driverId, type: POSITIVE_ADJUSTMENT|OTHER_DEDUCTION, amount, adjustmentDate, settlementMonth?, reason }` (reason mandatory)
- `GET /earnings/gross?month=|fromMonth=&toMonth=|driverId=` → per driver × month: `tripCount, tripEarnings, allowances, otherEarnings, positiveAdjustments, grossEarnings`

### Expenses — `/api/lv-expenses`, `/api/driver-expenses` (Phase 8)

One table (`driver_expenses`, `paidBy` LV|DRIVER) served by two scoped endpoints with the standard
line-item routes (list, totals by category, create, void). Each endpoint only sees and changes its own direction.

| Endpoint           | Direction                                 | Categories                     | Write permission        |
| ------------------ | ----------------------------------------- | ------------------------------ | ----------------------- |
| `/lv-expenses`     | LV paid, **deducted** from the settlement | FUEL, TOLL, MAINTENANCE, EMI   | `lv_expense.manage`     |
| `/driver-expenses` | Driver paid, **reimbursed** (added)       | FUEL, TOLL, MAINTENANCE, OTHER | `driver_expense.manage` |

Body: `{ driverId, vehicleId, category, amount, expenseDate, settlementMonth?, description, receiptReference? }`.
Extra list/totals filter: `vehicleId`.

### Advances — `/api/advances` (Phase 8)

View: `driver_finance.view`. Write: `advance.manage` (Admin, Biller).

| Method | Path                                    | Notes                                                                                                                             |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/advances`                             | Filters `driverId`, `status` (OPEN/RECOVERED/VOID). Includes recoveries                                                           |
| GET    | `/advances/summary?driverId=`           | `{ count, advanced, recovered, outstanding }`                                                                                     |
| GET    | `/advances/recoveries?driverId=&month=` | ACTIVE recoveries (settlement input)                                                                                              |
| POST   | `/advances`                             | `{ driverId, amount, advanceDate, reason, paymentMethod, referenceNumber? }` → OPEN, outstanding = amount                         |
| POST   | `/advances/:id/recoveries`              | `{ amount, settlementMonth, recoveryDate?, notes? }`. Row-locked. 409 `RECOVERY_EXCEEDS_OUTSTANDING`. Fully recovered → RECOVERED |
| POST   | `/advances/recoveries/:id/void`         | `{ reason }`. Restores the balance                                                                                                |
| POST   | `/advances/:id/void`                    | `{ reason }`. Only if there are no active recoveries                                                                              |

### Driver settlements — `/api/settlements` (Phase 9)

View `settlement.view` (all roles). Prepare `settlement.prepare` (Admin, Biller). Approve, reject,
finalize and reopen are **Admin only** (`settlement.approve|finalize|reopen`). Every step also checks the
current status on the server (409 `INVALID_SETTLEMENT_TRANSITION`).

| Method | Path                          | Notes                                                                                                          |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/settlements`                | Filters `month`, `driverId`, `status`, `paymentStatus`                                                         |
| GET    | `/settlements/summary?month=` | Counts per status, `finalizedTotal`, `paidTotal`, `outstandingTotal`                                           |
| POST   | `/settlements`                | `{ driverId, settlementMonth }` → created and calculated. 409 if one exists; 400 for a future month            |
| POST   | `/settlements/prepare`        | `{ settlementMonth }` → drafts for every driver with activity. Recalculates DRAFT/CALCULATED; others untouched |
| GET    | `/settlements/:id`            | Components (with direction), every item, revisions, `isStale`, `outstandingAmount`                             |
| POST   | `/:id/calculate`              | DRAFT/CALCULATED → CALCULATED (re-runs the engine)                                                             |
| POST   | `/:id/submit`                 | CALCULATED → UNDER_REVIEW. 409 `SETTLEMENT_STALE` if data changed                                              |
| POST   | `/:id/withdraw`               | UNDER_REVIEW → DRAFT (preparer)                                                                                |
| POST   | `/:id/approve`                | [Admin] UNDER_REVIEW → APPROVED (staleness re-checked)                                                         |
| POST   | `/:id/reject`                 | [Admin] `{ reason }` UNDER_REVIEW/APPROVED → DRAFT                                                             |
| POST   | `/:id/finalize`               | [Admin] APPROVED → FINALIZED, sets `paymentStatus`. 409 `NEGATIVE_SETTLEMENT` / `PAID_EXCEEDS_FINAL`           |
| POST   | `/:id/reopen`                 | [Admin] `{ reason }` FINALIZED → DRAFT. Revision snapshot kept, version +1                                     |

**Month lock** (applies to trips, imports, earnings, adjustments, expenses, advance recoveries): writes
for a driver-month whose settlement is UNDER_REVIEW/APPROVED → 409 `SETTLEMENT_IN_REVIEW`, FINALIZED →
409 `SETTLEMENT_LOCKED`. A CALCULATED settlement silently returns to DRAFT (recalculation required).

### Driver payments — `/api/payments` (Phase 10)

View `payment.view` (all roles). Record `payment.record` (Admin, Biller). Reverse `payment.reverse` (Admin).

| Method | Path                    | Notes                                                                                                                    |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/payments`             | Filters `driverId`, `settlementId`, `month` (settlement month), `method`, `status` (VALID/REVERSED), `fromDate`/`toDate` |
| GET    | `/payments/summary`     | Same filters → `{ count, total, byMethod[] }` over VALID payments                                                        |
| POST   | `/payments`             | `{ settlementId, amount, paymentDate, paymentMethod: CASH                                                                | BANK_TRANSFER | UPI | CHEQUE, referenceNumber?, notes?, proofReference? }`→`{ payment, settlement }`. Only FINALIZED settlements (409 `SETTLEMENT_NOT_FINALIZED`). Never above outstanding (409 `PAYMENT_EXCEEDS_OUTSTANDING`, also under concurrency). Date not in the future |
| POST   | `/payments/:id/reverse` | [Admin] `{ reason }`. Payment kept as REVERSED, outstanding restored                                                     |

`GET /settlements/:id` includes `payments[]` and `outstandingAmount`.

### LV profit — `/api/profit` (Phase 11)

`profit.view` (Admin, Auditor). Only RECEIVED company settlements (actual amount) and FINALIZED driver
settlements count. Pending and unfinalized amounts are returned separately for context.

| Method | Path                      | Notes                                      |
| ------ | ------------------------- | ------------------------------------------ |
| GET    | `/profit/monthly?month=   | fromMonth=&toMonth=&companyId=`            | `months[]: { settlementMonth, receivedAmount, pendingExpected, finalizedSettlements, lvProfit, unfinalizedSettlements }` plus `totals` |
| GET    | `/profit/companies?month= | fromMonth=&toMonth=`                       | `companies[]` (the `company: null` row = settlements with no trips, not attributable) plus `totals`                                    |
| GET    | `/profit/overall`         | All-time `totals` plus the monthly `trend` |

### Dashboard — `/api/dashboard` (Phase 12)

`GET /dashboard` (any signed-in user). It returns only the sections the caller's permissions allow:

| Section           | Needs                   | Content                                                                              |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `counts`          | master.view             | Active companies, drivers, vehicles; trips, km and trip earnings this month          |
| `companyReceipts` | company_settlement.view | This and last month expected / received / pending; past months still pending         |
| `settlements`     | settlement.view         | Last month by status; settlements awaiting approval or finalization; negative drafts |
| `payments`        | payment.view            | Outstanding to drivers; paid this month                                              |
| `profit`          | profit.view             | Last 6 months totals and trend                                                       |
| `imports`         | import.view             | Batches awaiting confirmation; with errors or failed (30 days)                       |
| `expenses`        | driver_finance.view     | This month LV-paid by category, driver-paid, entries                                 |
| `documentAlerts`  | master.view             | Licence, insurance, fitness and permit expiring within 30 days or expired            |
| `auditAlerts`     | audit.view              | Failed logins (24 h), reopens and payment reversals (30 days)                        |

### Reports & exports — `/api/reports` (Phase 13)

| Method | Path                       | Notes                                                              |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| GET    | `/reports`                 | Reports the caller may run: `{ key, title, filters[], columns[] }` |
| GET    | `/reports/:key?format=json | csv                                                                | xlsx | pdf&<filters>` | Same data, filters and **permission** for screen and export. JSON: `{ columns, rows, totals, rowCount, filters, generatedAt }`. Exports are audited (`EXPORT`) |

| Key                                                          | Permission              | Filters                                                         |
| ------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------- |
| `trips`                                                      | trip.view               | month, fromDate, toDate, companyId, driverId, vehicleId, status |
| `driver-earnings`                                            | driver_finance.view     | month, fromMonth, toMonth, driverId                             |
| `driver-settlements`, `driver-reconciliation`                | settlement.view         | month, fromMonth, toMonth, driverId (status)                    |
| `payment-outstanding`, `driver-payments`                     | payment.view            | month/dates, driverId (status)                                  |
| `expenses`                                                   | driver_finance.view     | month, dates, driverId, vehicleId, paidBy, category, status     |
| `advances`, `deductions`                                     | driver_finance.view     | dates/month, driverId (status)                                  |
| `company-settlements`                                        | company_settlement.view | month range, companyId, status                                  |
| `company-reconciliation`, `company-profit`, `monthly-profit` | profit.view             | month range, companyId                                          |
| `imports`                                                    | import.view             | dates, companyId, status                                        |

Formats: **CSV** (raw numbers, UTF-8 BOM, totals row, formula-injection safe), **Excel** (numeric money cells with Indian grouping, filters and author header) and **PDF** (landscape table; amounts in "Rs" because the built-in PDF fonts have no ₹ glyph). Up to 50,000 rows per report.

### Planned modules (spec §61)

`/api/auth`, `/api/users`, `/api/companies`, `/api/drivers`, `/api/vehicles`,
`/api/vehicle-types`, `/api/rates`, `/api/assignments`, `/api/company-settlements`,
`/api/trips`, `/api/trip-imports`, `/api/earnings`, `/api/driver-expenses`,
`/api/advances`, `/api/adjustments`, `/api/settlements`, `/api/payments`,
`/api/lv-expenses`, `/api/profit`, `/api/reports`, `/api/gst`, `/api/documents`,
`/api/notifications`, `/api/audit`. Each is documented here when its phase is delivered.
