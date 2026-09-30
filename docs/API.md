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

### Planned modules (spec §61)

`/api/auth`, `/api/users`, `/api/companies`, `/api/drivers`, `/api/vehicles`,
`/api/vehicle-types`, `/api/rates`, `/api/assignments`, `/api/company-settlements`,
`/api/trips`, `/api/trip-imports`, `/api/earnings`, `/api/driver-expenses`,
`/api/advances`, `/api/adjustments`, `/api/settlements`, `/api/payments`,
`/api/lv-expenses`, `/api/profit`, `/api/reports`, `/api/gst`, `/api/documents`,
`/api/notifications`, `/api/audit`. Each is documented here when its phase is delivered.
