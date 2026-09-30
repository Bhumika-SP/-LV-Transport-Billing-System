# Testing

Financial correctness matters more than visual completion (spec §81). Every money rule
has an automated test, and each phase must pass the full gate before it is committed.

## Running tests

```bash
npm test                 # backend (unit + integration) then frontend unit tests
npm run test -w backend  # backend only
npm run test -w frontend # frontend only (formatting, RBAC parity, audit diff)
```

Backend integration tests need a MySQL database set in `backend/.env.test`
(see `.env.test.example`). **Its name must end in `_test`.** The harness refuses any
other name, because it empties every table before each test. Migrations are applied
automatically before the run (`tests/setup/globalSetup.js`). Test files run one at a
time because they share that database. Uploaded test documents go to
`backend/storage-test/`, which is removed afterwards.

## The phase gate

Every phase is committed only when all of these pass:

| Check      | Command                                   |
| ---------- | ----------------------------------------- |
| Tests      | `npm test`                                |
| Lint       | `npm run lint`                            |
| Formatting | `npx prettier --check .`                  |
| Build      | `npm run build`                           |
| Migrations | `cd backend && npx prisma migrate status` |

CI (`.github/workflows/ci.yml`) runs the same gate on every push and pull request.

## Layout

| Location                    | What it covers                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `backend/tests/unit`        | Pure formulas and middleware: trip pricing, settlement formula, profit formula, rate limit |
| `backend/tests/integration` | Real HTTP calls through the Express app to a real MySQL database                           |
| `backend/tests/helpers`     | `seedBase` (reset + one user per role), `loginAll`, fixtures for master data               |
| `frontend/src/**/*.test.js` | Money/date formatting, frontend↔backend permission parity, navigation access, audit diff   |

## Coverage map: spec Phase 17 list

| Spec item                     | Tests                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                | `auth.test.js`, `rateLimit.test.js`                                                                                                          |
| RBAC                          | `rbac.test.js`, `route-inventory.test.js` (every route, anonymous → 401; no CSRF header → 403), per-module role checks, `navigation.test.js` |
| Company settlement            | `company-settlements.test.js`                                                                                                                |
| Trip calculation              | `trip-calculations.test.js`, `trips.test.js`                                                                                                 |
| Vehicle type rate history     | `rates.test.js`, `trips.test.js` (scenario S3)                                                                                               |
| Bulk import                   | `imports.test.js`                                                                                                                            |
| Duplicate detection           | `imports.test.js`                                                                                                                            |
| Driver earnings               | `earnings.test.js`                                                                                                                           |
| Driver reimbursement          | `expenses-advances.test.js`, `settlements.test.js`                                                                                           |
| LV-paid deductions            | `expenses-advances.test.js`, `settlements.test.js`                                                                                           |
| Advances and advance recovery | `expenses-advances.test.js` (scenario S5), `financial-edge-cases.test.js`                                                                    |
| Settlement calculation        | `settlement-formula.test.js`, `settlements.test.js` (scenario S1)                                                                            |
| Settlement approval           | `settlements.test.js`                                                                                                                        |
| Settlement finalization       | `settlements.test.js`                                                                                                                        |
| Settlement reopening          | `settlements.test.js`, `financial-edge-cases.test.js`                                                                                        |
| Payments and partial payments | `payments.test.js` (scenario S2), `financial-edge-cases.test.js`                                                                             |
| Outstanding calculation       | `payments.test.js`                                                                                                                           |
| LV profit                     | `profit-formula.test.js`, `profit.test.js` (scenarios S1b, S4)                                                                               |
| GST reports                   | `gst.test.js`                                                                                                                                |
| Documents and notifications   | `documents-notifications.test.js`                                                                                                            |
| Audit                         | `audit.test.js` (including database-level append-only triggers)                                                                              |

## Coverage map: spec §81 edge cases

All are exercised together in `financial-edge-cases.test.js`, and in depth in the
module suites.

| Edge case                    | Expected behaviour                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Positive amounts             | KM × rate, exact to the paisa                                                          |
| Zero amounts                 | A 0-KM trip prices to ₹0.00; zero-value money entries are rejected (400)               |
| Large amounts                | Crore-scale values stay exact; values beyond DECIMAL(15,2) are rejected                |
| Partial / multiple payments  | Outstanding and `PARTIALLY_PAID` → `PAID`; overpayment → 409                           |
| Duplicate imports            | Rows already imported are flagged as duplicates and never imported (`imports.test.js`) |
| Duplicate settlements        | One settlement per driver per month → 409                                              |
| Invalid / missing rates      | Negative rate → 400; no rate on the trip date → 422 on `tripDate`                      |
| Missing drivers / vehicles   | 400 with field errors                                                                  |
| Invalid KM                   | Negative, non-numeric, >2 decimals, end < start → 400; nothing saved                   |
| Advance over-recovery        | 409 `RECOVERY_EXCEEDS_OUTSTANDING`                                                     |
| Settlement reopening         | Reason required; finalized figures kept as a revision; recalculation required          |
| Permission violations        | Auditor cannot record money; Biller cannot approve or finalize                         |
| Pending company receipts     | Counted as `pendingExpected`, never as received or profit                              |
| Finalized settlement changes | New trips/earnings for a finalized month → 409 `SETTLEMENT_LOCKED`                     |

## Acceptance scenarios (spec §76–80)

S1–S5 in [BUSINESS_RULES.md](BUSINESS_RULES.md#required-acceptance-scenarios-spec-7680)
are asserted with the exact figures from the spec in `settlements.test.js`,
`payments.test.js`, `trips.test.js`, `profit.test.js` and `expenses-advances.test.js`.

## Writing new tests

- Call `seedBase()` in `beforeEach`. It gives a clean database and one user per role;
  `loginAll(app)` returns an agent for each role that already sends the CSRF header.
- Compare money as strings (`'135000.00'`), never as floats.
- A new route needs no extra auth test: `route-inventory.test.js` discovers it and fails
  if it can be reached anonymously.
