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

- Uses only company settlements with status **RECEIVED** and driver settlements with status **FINALIZED**.
- Fuel, toll, maintenance and EMI are **never** subtracted again. They are already inside the driver settlement.
- V1 has no separate "net profit after LV expenses" figure.
- Views: company-wise, monthly, overall.

## R2. Trip earnings (Phase 5)

```
TRIP EARNINGS = TOTAL KM × VEHICLE-TYPE RATE EFFECTIVE ON THE TRIP DATE
```

- KM source is either `START_END` (total = end − start, and end ≥ start) or `DIRECT` (total taken from source). KM is never negative.
- The rate used and the rate per km are stored on the trip. Later rate changes never alter existing trips. Recalculation is an explicit, authorized, audited action.

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

## R4. Company settlement (Phase 4)

- One record per company per month (database UNIQUE).
- `PENDING` means expected but not received, and it never counts as received. `RECEIVED` records the actual amount and date. Expected and received amounts are both kept.

## R5. Final driver settlement (Phase 9), the locked formula

```
  TRIP EARNINGS + ALLOWANCES + OTHER EARNINGS + POSITIVE ADJUSTMENTS      (= gross earnings)
+ DRIVER-PAID EXPENSE REIMBURSEMENTS
− LV-PAID FUEL − LV-PAID TOLL − LV-PAID MAINTENANCE − LV-PAID EMI
− ADVANCE RECOVERY − OTHER DRIVER DEDUCTIONS
= FINAL DRIVER SETTLEMENT
```

- Monthly only, with one settlement per driver per month (database UNIQUE).
- Each component is stored with line-level items so the calculation is transparent.

## R6. Expense direction (Phase 8)

| Paid by | Categories                     | Effect on driver settlement |
| ------- | ------------------------------ | --------------------------- |
| LV      | Fuel, Toll, Maintenance, EMI   | **Deducted**                |
| Driver  | Fuel, Toll, Maintenance, Other | **Added** (reimbursement)   |

Driver-paid expenses are recorded by the biller and need no manager approval.

## R7. Advances (Phase 8)

- An advance is money already paid out. It is recovered through later settlements, and partial recovery is allowed.
- `outstanding = amount − Σ recoveries`. A recovery above the outstanding balance is rejected.

## R8. Other deductions (Phase 8)

Every deduction has an amount, a reason, the driver, the settlement month, the date and the creating user. Unexplained deductions are not allowed.

## R9. Settlement workflow (Phase 9)

```
DRAFT → CALCULATED → UNDER_REVIEW → APPROVED → FINALIZED
          (biller prepares)          (admin/manager only)
```

- Billers cannot approve or finalize. This is enforced by the backend.
- **Reopen** is for Admin/Manager only. It requires a reason, preserves a snapshot of the finalized state, is audited, and returns the settlement to an editable state. Recalculation, re-approval and re-finalization are then required.

## R10. Payments (Phase 10)

```
OUTSTANDING = FINAL SETTLEMENT − TOTAL VALID PAYMENTS
```

- Payment status is `UNPAID`, `PARTIALLY_PAID` or `PAID`. Multiple payments are allowed, and a payment may not exceed the outstanding amount.
- Methods are **Cash, Bank Transfer, UPI and Cheque only**.
- Payments are immutable. Corrections are made only by reversal.

## R11. Money and dates

- `DECIMAL(15,2)` for money. JavaScript floating point is never used for money. The UI shows INR as `₹25,00,000.00`.
- Business timezone is Asia/Kolkata. Months are `YYYY-MM` and are deterministic whatever the browser timezone.

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
