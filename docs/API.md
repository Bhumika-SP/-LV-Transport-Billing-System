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
- Auth (from Phase 2) uses an HTTP-only cookie, so clients must send credentials.

### Standard error codes

| HTTP | Code                                                          | When                              |
| ---- | ------------------------------------------------------------- | --------------------------------- |
| 400  | `VALIDATION_ERROR`                                            | Request failed schema validation  |
| 400  | `INVALID_JSON`                                                | Malformed JSON body               |
| 400  | `INVALID_REFERENCE`                                           | Foreign key target does not exist |
| 401  | `UNAUTHORIZED`                                                | Not signed in                     |
| 403  | `FORBIDDEN`                                                   | Signed in but not permitted       |
| 404  | `ROUTE_NOT_FOUND` / `RECORD_NOT_FOUND` / `<ENTITY>_NOT_FOUND` | Unknown route or record           |
| 409  | `DUPLICATE_RECORD` / domain-specific                          | Unique rule violated              |
| 413  | `PAYLOAD_TOO_LARGE`                                           | Body over limit (1 MB JSON)       |
| 500  | `INTERNAL_ERROR`                                              | Unexpected error                  |
| 503  | `DATABASE_UNAVAILABLE`                                        | Database unreachable              |

## Endpoints

### System

| Method | Path      | Auth   | Description                                                                                                 |
| ------ | --------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/health` | Public | Liveness and DB check. 200 `{status:"ok", database:{status:"up", latencyMs}}` or 503 `DATABASE_UNAVAILABLE` |
| GET    | `/api`    | Public | API name and version                                                                                        |

### Planned modules (spec §61)

`/api/auth`, `/api/users`, `/api/companies`, `/api/drivers`, `/api/vehicles`,
`/api/vehicle-types`, `/api/rates`, `/api/assignments`, `/api/company-settlements`,
`/api/trips`, `/api/trip-imports`, `/api/earnings`, `/api/driver-expenses`,
`/api/advances`, `/api/adjustments`, `/api/settlements`, `/api/payments`,
`/api/lv-expenses`, `/api/profit`, `/api/reports`, `/api/gst`, `/api/documents`,
`/api/notifications`, `/api/audit`. Each is documented here when its phase is delivered.
