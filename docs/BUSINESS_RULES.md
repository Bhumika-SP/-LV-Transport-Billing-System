# Business Rules

Condensed from the master specification, which remains the source of truth. Each rule
names the phase that implements it and the service that owns it. Formulas are
implemented **once**, in backend services. React never computes financial values.

## Core flow

```
Company → Monthly company settlement → Trips (KM × vehicle-type rate) → Driver earnings
→ Expenses / adjustments → Driver settlement → Approval → Finalization → Driver payment
```

## R1. LV profit (Phase 11)

```
LV PROFIT = ACTUAL COMPANY AMOUNT RECEIVED − TOTAL FINALIZED DRIVER SETTLEMENTS
```

- Company side: company settlements with status **RECEIVED**, using the **actual received amount**. PENDING never counts; it is shown separately as "pending (expected)".
- Driver side: driver settlements with status **FINALIZED** only. Draft, calculated, under-review and approved settlements are excluded and reported as "not yet finalized".
- Fuel, toll, maintenance and EMI are **never** subtracted again: they are already inside the finalized settlements (tested).
- Months are matched by **settlement month** (A6).
- **Company-wise (A7, confirmed):** at finalization each settlement is attributed to the companies the driver served that month, in proportion to that driver's trip earnings per company. It is exact to the paisa (largest remainder) and stored in `driver_settlement_allocations`. The method is a setting (`profit.allocationMethod`: trip earnings or trip count). A settlement with no trips is kept as "not attributable" so totals still reconcile. Reopen removes the allocation; re-finalizing recreates it.
- Views: company-wise, monthly (with company filter), overall (with trend). Admin and Auditor only.
- The formula lives only in `profit/profit-formula.js`.

## R2. Trip earnings (Phase 5)

```
TRIP EARNINGS = TOTAL KM × VEHICLE-TYPE RATE EFFECTIVE ON THE TRIP DATE   (rounded half-up to paise)
```

- **KM:** `START_END` gives total = end − start (end ≥ start). `DIRECT` gives total as entered. KM is never negative, at most 2 decimals, and zero is allowed. The method is stored (`km_source`).
- **Rate lookup:** vehicle → its vehicle type → the ACTIVE rate effective on the trip date. No rate means the trip is rejected (`RATE_NOT_FOUND`).
- **Frozen values:** each trip stores `vehicle_type_id`, `rate_id`, `rate_per_km` and `earnings`. New or cancelled rates **never** change existing trips.
- **Editing:** changing KM or text keeps the stored rate. Changing the trip date or vehicle applies the rate for the new date, as for a new trip.
- **Recalculation:** only an explicit Admin action (single trip or vehicle type + date range), with a reason, audited with old and new values. It uses the vehicle's current type and the rate currently effective on the trip date.
- **Uniqueness:** an external trip ID is unique per company (DB constraint).
- **Trip date:** cannot be in the future (IST). Settlement month = the trip date's `YYYY-MM`.
- **Assignment consistency:** a vehicle not assigned to the company, or a driver not assigned to the vehicle, on the trip date produces a **warning**, not an error (A5).
- **Cancellation:** trips are cancelled with a reason (never deleted) and excluded from all totals.
- **Single source:** the formula lives only in `trip-calculations.js`. The UI preview calls `POST /trips/preview`.

## R3. Rate history (Phase 3)

- Rates belong to a vehicle type, not to a vehicle. Effective periods for ACTIVE rates never overlap.
- Historical rates are never overwritten. There is no edit. A rate entered in error is **cancelled** with a reason, and the row is kept.
- Adding a new open-ended rate automatically ends the current open-ended rate the day before (audited). Any other overlap is rejected.
- Rate lookup for a date: `effectiveFrom ≤ date ≤ effectiveTo (or open)`, status ACTIVE. No match means no rate (an error when pricing a trip).
- Only Admin/Manager adds or cancels rates.

## R3b. Assignments (Phase 3)

- Vehicle → company and driver → vehicle are separate, effective-dated histories. A driver is not tied to one vehicle forever, and a vehicle is not tied to one company forever.
- By default a vehicle serves one company at a time, a driver drives one vehicle at a time, and a vehicle has one driver at a time. Each rule is a setting (see A12).
- Only ACTIVE drivers, vehicles and companies can be newly assigned. Assignments are ended by setting an end date, never deleted.

## R3c. Bulk import (Phase 6)

- **Templates:** nothing about a company's file layout is hard-coded. Each company has templates with its column mapping, date format, KM method, how drivers are identified (code, licence, phone or unique name) and the **duplicate key**.
- **Workflow:** upload → company → template → read → map → normalize → validate → duplicates → **preview** → confirm → **transactional** import → summary → history.
- **Row statuses:** VALID, WARNING (imported by default; can be excluded), ERROR (never imported), DUPLICATE (never imported) and IMPORTED.
- **Validation:** required fields, date format (ISO `YYYY-MM-DD` is always accepted too), future dates, driver and vehicle existence (registration normalized), KM rules, rate availability, text lengths. Unmatched company/vehicle/driver assignments are warnings (A5).
- **Duplicates:** matched within the company against existing ACTIVE trips and earlier rows of the same file, using the template's key (default: external trip ID if mapped, else date + vehicle + driver + reference). An external trip ID already used by any trip of the company, even a cancelled one, is always a duplicate, because the database keeps it unique. The reason is recorded on the row.
- **Pricing:** imported trips use exactly the same KM, rate and earnings functions as manual trips.
- **Confirm:** re-validates against current data before inserting. All-or-nothing.

## R4. Company settlement (Phase 4)

- One record per company per month, enforced by a database UNIQUE on (`company_id`, `settlement_month`).
- Created as **PENDING** with the **expected** amount. PENDING never counts as money received.
- **RECEIVED** records the **actual** amount, received date (not in the future), payment method (Cash / Bank Transfer / UPI / Cheque) and an optional reference. Expected and received are both kept, and the difference is shown.
- Only RECEIVED amounts feed LV profit. The single source is `receivedAmountsByCompanyMonth()` / `summarizeCompanySettlements().receivedTotal`.
- Biller/Admin record and mark received. After receipt, changes need Admin plus a reason: correct, revert to PENDING, or delete (PENDING only). Previous values are kept in the audit log.

## R4b. Driver earnings (Phase 7)

```
GROSS DRIVER EARNINGS = TRIP EARNINGS + ALLOWANCES + OTHER EARNINGS + POSITIVE ADJUSTMENTS
```

- Allowances, other earnings and positive adjustments are **separate line items**, never merged into one amount. Each has a driver, date, settlement month, amount > 0 and a description or reason (a reason is mandatory for adjustments).
- The settlement month defaults to the month of the item date and can be set explicitly.
- Items are **voided with a reason**, never deleted. Voided items and cancelled trips never count.
- The formula lives only in `settlements/settlement-formula.js` (`calculateGrossEarnings`, `calculateDriverSettlement`).

## R5. Final driver settlement (Phase 9), the locked formula

```
  TRIP EARNINGS + ALLOWANCES + OTHER EARNINGS + POSITIVE ADJUSTMENTS      (= gross earnings)
+ DRIVER-PAID EXPENSE REIMBURSEMENTS                                      (= subtotal / total additions)
− LV-PAID FUEL − LV-PAID TOLL − LV-PAID MAINTENANCE − LV-PAID EMI
− ADVANCE RECOVERY − OTHER DRIVER DEDUCTIONS                              (= total deductions)
= FINAL DRIVER SETTLEMENT
```

- Monthly only; one settlement per driver per month (DB UNIQUE).
- **Engine** (`settlement-engine.js`): collects every ACTIVE source row of the driver-month (trips, earnings, adjustments, expenses, advance recoveries). Stores one **item per source row** plus the 11 component totals, and computes with `settlement-formula.js`. It is deterministic, and a SHA-256 fingerprint of the items detects stale calculations.
- The backend is the only calculator. The UI shows the stored components and items (§49 layout).
- A **negative** final amount cannot be finalized (A24). Carry the balance forward as an other deduction next month.

## R6. Expense direction (Phase 8)

| Paid by | Categories                     | Effect on driver settlement | Endpoint               |
| ------- | ------------------------------ | --------------------------- | ---------------------- |
| LV      | Fuel, Toll, Maintenance, EMI   | **Deducted**                | `/api/lv-expenses`     |
| Driver  | Fuel, Toll, Maintenance, Other | **Added** (reimbursement)   | `/api/driver-expenses` |

- Direction is decided **only** by who paid (`paidBy`). A client cannot switch it: each endpoint forces its own direction.
- Every expense records driver, vehicle, category, amount, date, paid by, description, receipt reference, settlement month, status and creator.
- Driver-paid expenses are recorded by the biller with **no manager approval** (spec §22).
- LV-paid expenses are **never** subtracted again in LV profit. They only affect the driver settlement.

## R7. Advances (Phase 8)

- An advance is money already paid out (amount, date, reason, payment method, reference). It is recovered through later settlements.
- **Partial recovery** is allowed. Each recovery belongs to a settlement month.
- `outstanding = amount − Σ ACTIVE recoveries` and `recovered + outstanding = amount` always hold.
- **A recovery above the outstanding balance is rejected**, also under concurrent requests (row lock).
- When fully recovered the advance becomes RECOVERED. Voiding a recovery restores the balance and reopens it.
- An advance can only be voided while nothing has been recovered.
- The recovery amount per month is entered by staff (A8). There is no automatic schedule.

## R8. Other deductions (Phase 8)

Every deduction has an amount, a reason, the driver, the settlement month, the date and the creating user. Unexplained deductions are not allowed.

## R9. Settlement workflow (Phase 9)

```
DRAFT → CALCULATED → UNDER_REVIEW → APPROVED → FINALIZED  (+ payment status UNPAID / PARTIALLY_PAID / PAID)
   (Biller: create, calculate, submit, withdraw)   (Admin/Manager: approve, reject, finalize, reopen)
```

- **Billers cannot approve, finalize or reopen.** Enforced by permission and by status on the server.
- Submit, approve and finalize **re-run the engine and refuse a stale calculation**.
- **Month lock:** once submitted, the driver-month's data (trips, imports, earnings, adjustments, expenses, recoveries) cannot change until it is withdrawn, rejected or reopened. After finalization it is locked until reopened. Editing data under a CALCULATED settlement returns it to DRAFT.
- **Reopen** (Admin only) needs a mandatory reason. The finalized settlement and its items are preserved as a **revision snapshot**. Version +1. The settlement returns to DRAFT, so recalculation, re-approval and re-finalization are all required. Every step is audited (CREATE, CALCULATE, SUBMIT, APPROVE, REJECT, FINALIZE, REOPEN).

## R10. Payments (Phase 10)

```
OUTSTANDING = FINAL SETTLEMENT − TOTAL VALID PAYMENTS
```

- Settlement and payment are separate. Only **FINALIZED** settlements are payable, and multiple partial payments are allowed.
- Payment status: `UNPAID` (nothing paid), `PARTIALLY_PAID`, or `PAID` (paid = final). It is kept on the settlement and recomputed from VALID payments.
- A payment can **never exceed the outstanding amount**. The settlement row is locked, so concurrent payments cannot overpay.
- Methods are Cash, Bank Transfer, UPI and Cheque only. Each payment records amount, date, method, reference, notes, proof reference, creator and time.
- Payments are **immutable**. The only correction is an **Admin reversal** with a mandatory reason. The row is kept as REVERSED and the outstanding amount is restored.
- **Reopened settlements:** existing payments stay linked. No new payments until re-finalized. Re-finalization is refused if the new final amount is below what has already been paid (`PAID_EXCEEDS_FINAL`); reverse the excess first.

## R11. Money and dates

- `DECIMAL(15,2)` for money. JavaScript floating point is never used for money. The UI shows INR as `₹25,00,000.00`.
- Business timezone is Asia/Kolkata. Months are `YYYY-MM` and are deterministic whatever the browser timezone.

## R12. GST (Phase 14) — reporting and preparation only

- The system prepares GST figures; it never files returns. Every GST screen carries this disclaimer.
- GST and cess rates come from Admin-maintained `tax_rate_configs` (HSN/SAC, effective dates). No rate is hard-coded.
- Tax is computed on the server: intra-state supply → CGST = SGST = rate ÷ 2; inter-state → IGST = rate. Cess = taxable × cess rate. Each head is rounded to paise (half-up); invoice value = taxable + all heads.
- The tax period defaults to the invoice month and may be overridden.
- An invoice is unique per (direction, counterparty GSTIN, invoice number); blank GSTIN means unregistered (B2C).
- Records are never deleted: voiding (with a reason) keeps them in history and excludes them from every report.
- Indicative net payable = output tax + reverse-charge tax − input tax credit. ITC eligibility and blocked credits are for the tax professional to judge.
- The home state (`gst.homeStateCode` setting) is informational; the supply type is chosen per record.
- Admin and Auditor may view and record GST; only Admin changes tax configuration; Billers have no GST access.

## Required acceptance scenarios (spec §76–80)

| #   | Scenario                                                                                | Expected                                                        |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| S1  | Driver 1: 150000 + 5000 + 2000 + 1000 + 3000 − 5000 − 2000 − 3000 − 10000 − 5000 − 1000 | **₹1,35,000.00** exactly                                        |
| S1b | Company received ₹25,00,000, finalized driver total ₹23,50,000                          | Profit **₹1,50,000**                                            |
| S2  | ₹1,35,000 settlement: pay 50,000 Cash + 50,000 Bank                                     | Outstanding ₹35,000, `PARTIALLY_PAID`                           |
| S2b | Then pay 35,000 UPI                                                                     | Outstanding ₹0, `PAID`                                          |
| S3  | Sedan ₹18/km to Mar 31, ₹20/km from Apr 1. 100 km trips on Mar 20 and Apr 10            | ₹1,800 and ₹2,000. Changing rates does not alter the March trip |
| S4  | Infosys Sept expected ₹25,00,000, `PENDING`                                             | Not counted in profit until `RECEIVED`                          |
| S5  | Advance ₹20,000, recovered 8,000 / 7,000 / 5,000                                        | Remaining 12,000 → 5,000 → 0. Over-recovery rejected            |

These become automated tests in the phases that implement them and are consolidated in Phase 17.

## Open assumptions

See [ARCHITECTURE.md → Assumptions](ARCHITECTURE.md#assumptions-documented-per-spec-instruction).
The main open item is **A7**, how a driver's settlement is allocated across companies for company-wise profit.
