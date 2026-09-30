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

### Planned modules (spec §61)

`/api/auth`, `/api/users`, `/api/companies`, `/api/drivers`, `/api/vehicles`,
`/api/vehicle-types`, `/api/rates`, `/api/assignments`, `/api/company-settlements`,
`/api/trips`, `/api/trip-imports`, `/api/earnings`, `/api/driver-expenses`,
`/api/advances`, `/api/adjustments`, `/api/settlements`, `/api/payments`,
`/api/lv-expenses`, `/api/profit`, `/api/reports`, `/api/gst`, `/api/documents`,
`/api/notifications`, `/api/audit`. Each is documented here when its phase is delivered.
