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

### Planned modules (spec §61)

`/api/auth`, `/api/users`, `/api/companies`, `/api/drivers`, `/api/vehicles`,
`/api/vehicle-types`, `/api/rates`, `/api/assignments`, `/api/company-settlements`,
`/api/trips`, `/api/trip-imports`, `/api/earnings`, `/api/driver-expenses`,
`/api/advances`, `/api/adjustments`, `/api/settlements`, `/api/payments`,
`/api/lv-expenses`, `/api/profit`, `/api/reports`, `/api/gst`, `/api/documents`,
`/api/notifications`, `/api/audit`. Each is documented here when its phase is delivered.
