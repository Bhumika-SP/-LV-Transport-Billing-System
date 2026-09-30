/**
 * DEVELOPMENT / TEST DATA ONLY — never run in production (guarded by seed.js).
 * Names, phone numbers and registrations below are fictitious.
 *
 * Uses the real services so seeded data obeys the same rules (rate history,
 * assignment overlaps) and appears in the audit log. Idempotent: skips any
 * section whose data already exists.
 */
import { prisma } from '../src/lib/prisma.js';
import { createAssignment } from '../src/modules/assignments/assignments.service.js';
import { createCompany } from '../src/modules/companies/companies.service.js';
import {
  createCompanySettlement,
  markReceived,
} from '../src/modules/company-settlements/company-settlements.service.js';
import { createDriver } from '../src/modules/drivers/drivers.service.js';
import { adjustmentsService, earningsService } from '../src/modules/earnings/earnings.service.js';
import { createAdvance, recordRecovery } from '../src/modules/advances/advances.service.js';
import {
  driverExpensesService,
  lvExpensesService,
} from '../src/modules/expenses/expenses.service.js';
import { createRate } from '../src/modules/rates/rates.service.js';
import {
  approveSettlement,
  finalizeSettlement,
  prepareMonth,
  submitSettlement,
} from '../src/modules/settlements/settlements.service.js';
import { recordPayment } from '../src/modules/payments/payments.service.js';
import { createGstRecord, createTaxRate } from '../src/modules/gst/gst.service.js';
import { allocateSettlement } from '../src/modules/profit/allocation.service.js';
import { createTrip } from '../src/modules/trips/trips.service.js';
import { createVehicleType } from '../src/modules/vehicle-types/vehicle-types.service.js';
import { createVehicle } from '../src/modules/vehicles/vehicles.service.js';

const COMPANIES = [
  { name: 'Infosys', code: 'INFY', contactPerson: 'Transport Desk (DEV)', phone: '080 0000 0001' },
  { name: 'Wipro', code: 'WIPRO', contactPerson: 'Admin Office (DEV)', phone: '080 0000 0002' },
  {
    name: 'Tech Mahindra',
    code: 'TECHM',
    contactPerson: 'Facilities (DEV)',
    phone: '080 0000 0003',
  },
];

/** Spec §13/§78: Sedan ₹18 until 31 Mar 2026, ₹20 from 1 Apr 2026; SUV ₹22; Innova ₹24. */
const TYPES = [
  {
    name: 'Sedan',
    description: 'Dzire / Etios class',
    rates: [
      { ratePerKm: '18.00', effectiveFrom: '2026-01-01' },
      { ratePerKm: '20.00', effectiveFrom: '2026-04-01' },
    ],
  },
  {
    name: 'SUV',
    description: 'Ertiga / XUV class',
    rates: [{ ratePerKm: '22.00', effectiveFrom: '2026-01-01' }],
  },
  {
    name: 'Innova',
    description: 'Innova / Crysta',
    rates: [{ ratePerKm: '24.00', effectiveFrom: '2026-01-01' }],
  },
];

const DRIVERS = [
  {
    fullName: 'Ravi Kumar (DEV)',
    phone: '90000 00001',
    licenseNumber: 'DEV-DL-0001',
    joiningDate: '2025-04-01',
  },
  {
    fullName: 'Suresh Babu (DEV)',
    phone: '90000 00002',
    licenseNumber: 'DEV-DL-0002',
    joiningDate: '2025-05-15',
  },
  {
    fullName: 'Manjunath R (DEV)',
    phone: '90000 00003',
    licenseNumber: 'DEV-DL-0003',
    joiningDate: '2025-07-01',
  },
  {
    fullName: 'Imran Pasha (DEV)',
    phone: '90000 00004',
    licenseNumber: 'DEV-DL-0004',
    joiningDate: '2025-08-10',
  },
  {
    fullName: 'Prakash N (DEV)',
    phone: '90000 00005',
    licenseNumber: 'DEV-DL-0005',
    joiningDate: '2025-09-01',
  },
  {
    fullName: 'Venkatesh S (DEV)',
    phone: '90000 00006',
    licenseNumber: 'DEV-DL-0006',
    joiningDate: '2026-01-05',
  },
];

// [registration, type, make, model, company code, driver index]
const VEHICLES = [
  ['KA01DV0001', 'Sedan', 'Maruti', 'Dzire', 'INFY', 0],
  ['KA01DV0002', 'Sedan', 'Toyota', 'Etios', 'INFY', 1],
  ['KA01DV0003', 'SUV', 'Maruti', 'Ertiga', 'INFY', 2],
  ['KA01DV0004', 'Innova', 'Toyota', 'Innova Crysta', 'WIPRO', 3],
  ['KA01DV0005', 'Sedan', 'Maruti', 'Dzire', 'WIPRO', 4],
  ['KA01DV0006', 'SUV', 'Mahindra', 'XUV500', 'TECHM', 5],
];

async function seedMasterData(actor) {
  if ((await prisma.company.count()) > 0) {
    console.log('  master data already present — skipped');
    return;
  }

  const companies = {};
  for (const c of COMPANIES) companies[c.code] = await createCompany(c, actor);

  const types = {};
  for (const t of TYPES) {
    types[t.name] = await createVehicleType({ name: t.name, description: t.description }, actor);
    for (const r of t.rates) await createRate({ vehicleTypeId: types[t.name].id, ...r }, actor);
  }

  const drivers = [];
  for (const d of DRIVERS) drivers.push(await createDriver(d, actor));

  for (const [reg, type, make, model, companyCode, driverIdx] of VEHICLES) {
    const vehicle = await createVehicle(
      {
        registrationNumber: reg,
        vehicleTypeId: types[type].id,
        make,
        model,
        year: 2024,
        fuelType: 'DIESEL',
      },
      actor,
    );
    await createAssignment(
      'vehicle',
      { vehicleId: vehicle.id, companyId: companies[companyCode].id, startDate: '2026-01-01' },
      actor,
    );
    await createAssignment(
      'driver',
      { driverId: drivers[driverIdx].id, vehicleId: vehicle.id, startDate: '2026-01-01' },
      actor,
    );
  }
  console.log(
    `  ${COMPANIES.length} companies, ${TYPES.length} vehicle types, ${DRIVERS.length} drivers, ${VEHICLES.length} vehicles`,
  );
}

/** [company code, month, expected, received (null = still PENDING), received date, method, ref] */
const COMPANY_SETTLEMENTS = [
  ['INFY', '2026-08', '2450000.00', '2450000.00', '2026-09-05', 'BANK_TRANSFER', 'DEV-UTR-0801'],
  ['WIPRO', '2026-08', '1200000.00', '1180000.00', '2026-09-07', 'CHEQUE', 'DEV-CHQ-0802'],
  ['TECHM', '2026-08', '600000.00', '600000.00', '2026-09-10', 'UPI', 'DEV-UPI-0803'],
  // Scenario §79 starting point: Infosys September expected 25,00,000, still PENDING.
  ['INFY', '2026-09', '2500000.00', null],
  ['WIPRO', '2026-09', '1250000.00', null],
];

async function seedCompanySettlements(actor) {
  if ((await prisma.companySettlement.count()) > 0) {
    console.log('  company settlements already present — skipped');
    return;
  }
  const companies = Object.fromEntries((await prisma.company.findMany()).map((c) => [c.code, c]));
  for (const [code, month, expected, received, date, method, ref] of COMPANY_SETTLEMENTS) {
    const s = await createCompanySettlement(
      { companyId: companies[code].id, settlementMonth: month, expectedAmount: expected },
      actor,
    );
    if (received) {
      await markReceived(
        s.id,
        {
          receivedAmount: received,
          receivedDate: date,
          paymentMethod: method,
          referenceNumber: ref,
        },
        actor,
      );
    }
  }
  console.log(`  ${COMPANY_SETTLEMENTS.length} company settlements`);
}

/**
 * Trips for Aug–Sep 2026: each vehicle's current driver does a trip on most weekdays.
 * Deterministic KM values (no randomness) so seeded totals are reproducible.
 */
async function seedTrips(actor) {
  if ((await prisma.trip.count()) > 0) {
    console.log('  trips already present — skipped');
    return;
  }
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { id: 'asc' },
    include: {
      companyAssignments: { include: { company: true } },
      driverAssignments: true,
    },
  });
  let count = 0;
  for (const [v, vehicle] of vehicles.entries()) {
    const company = vehicle.companyAssignments[0]?.company;
    const driverId = vehicle.driverAssignments[0]?.driverId;
    if (!company || !driverId) continue;
    for (const month of ['2026-08', '2026-09']) {
      for (let day = 3 + v; day <= 27; day += 5) {
        const tripDate = `${month}-${String(day).padStart(2, '0')}`;
        const startKm = 10000 + v * 5000 + count * 180;
        const useStartEnd = day % 2 === 1;
        const km = 60 + ((day * 7 + v * 11) % 90);
        await createTrip(
          {
            companyId: company.id,
            driverId,
            vehicleId: vehicle.id,
            tripDate,
            externalTripId: `${company.code}-DEV-${month.replace('-', '')}-${v + 1}${String(day).padStart(2, '0')}`,
            pickup: 'Office Campus (DEV)',
            dropLocation: 'Employee Drop Zone (DEV)',
            kmSource: useStartEnd ? 'START_END' : 'DIRECT',
            ...(useStartEnd
              ? { startKm: String(startKm), endKm: String(startKm + km) }
              : { totalKm: String(km) }),
          },
          actor,
        );
        count += 1;
      }
    }
  }
  console.log(`  ${count} trips`);
}

/** Allowances, other earnings and positive adjustments for Aug–Sep 2026. */
async function seedEarnings(actor) {
  if ((await prisma.driverEarning.count()) > 0) {
    console.log('  earnings already present — skipped');
    return;
  }
  const drivers = await prisma.driver.findMany({ orderBy: { id: 'asc' } });
  let count = 0;
  for (const month of ['2026-08', '2026-09']) {
    for (const [i, d] of drivers.entries()) {
      await earningsService.create(
        {
          driverId: d.id,
          type: 'ALLOWANCE',
          amount: '1000.00',
          earningDate: `${month}-25`,
          description: 'Night shift allowance (DEV)',
        },
        actor,
      );
      count += 1;
      if (i < 3) {
        await earningsService.create(
          {
            driverId: d.id,
            type: 'OTHER_EARNING',
            amount: '500.00',
            earningDate: `${month}-26`,
            description: 'Festival incentive (DEV)',
          },
          actor,
        );
        count += 1;
      }
    }
  }
  await adjustmentsService.create(
    {
      driverId: drivers[0].id,
      type: 'POSITIVE_ADJUSTMENT',
      amount: '250.00',
      adjustmentDate: '2026-09-27',
      reason: 'Zero-complaint bonus (DEV)',
    },
    actor,
  );
  console.log(`  ${count} earnings, 1 positive adjustment`);
}

/** LV-paid and driver-paid expenses, an advance with a partial recovery, a deduction. */
async function seedExpensesAndAdvances(actor) {
  if ((await prisma.driverExpense.count()) > 0) {
    console.log('  expenses/advances already present — skipped');
    return;
  }
  const pairs = await prisma.driverAssignment.findMany({ orderBy: { driverId: 'asc' } });
  let count = 0;
  for (const month of ['2026-08', '2026-09']) {
    for (const [i, { driverId, vehicleId }] of pairs.entries()) {
      const lv = [
        ['FUEL', 4000 + i * 250, 'Diesel (fuel card) (DEV)'],
        ['TOLL', 600 + i * 50, 'FASTag tolls (DEV)'],
        ['EMI', '3000', 'Vehicle loan EMI (DEV)'],
        ...(i % 2 === 0 ? [['MAINTENANCE', '1500', 'Periodic service (DEV)']] : []),
      ];
      for (const [category, amount, description] of lv) {
        await lvExpensesService.create(
          {
            driverId,
            vehicleId,
            category,
            amount: String(amount),
            expenseDate: `${month}-20`,
            description,
          },
          actor,
        );
        count += 1;
      }
      if (i < 2) {
        await driverExpensesService.create(
          {
            driverId,
            vehicleId,
            category: 'FUEL',
            amount: '2000',
            expenseDate: `${month}-14`,
            description: 'Paid fuel in cash on outstation trip (DEV)',
            receiptReference: `DEV-BILL-${month}-${i + 1}`,
          },
          actor,
        );
        count += 1;
      }
    }
  }

  // Scenario §80 starting point: ₹20,000 advance, ₹8,000 recovered in August.
  const advance = await createAdvance(
    {
      driverId: pairs[0].driverId,
      amount: '20000',
      advanceDate: '2026-07-15',
      reason: 'Medical emergency (DEV)',
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'DEV-UTR-ADV-1',
    },
    actor,
  );
  await recordRecovery(advance.id, { amount: '8000', settlementMonth: '2026-08' }, actor);

  await adjustmentsService.create(
    {
      driverId: pairs[1].driverId,
      type: 'OTHER_DEDUCTION',
      amount: '2000',
      adjustmentDate: '2026-09-18',
      reason: 'Previous overpayment (DEV)',
    },
    actor,
  );
  console.log(`  ${count} expenses, 1 advance (8,000 recovered), 1 other deduction`);
}

/**
 * August 2026: prepared and taken through submit → approve → finalize (negative results
 * are left calculated — they cannot be finalized). September 2026: prepared drafts.
 */
async function seedSettlements(actor) {
  if ((await prisma.driverSettlement.count()) > 0) {
    console.log('  settlements already present — skipped');
    return;
  }
  await prepareMonth({ settlementMonth: '2026-08' }, actor);
  const august = await prisma.driverSettlement.findMany({ where: { settlementMonth: '2026-08' } });
  let finalized = 0;
  for (const s of august) {
    if (s.finalAmount.isNegative()) continue;
    await submitSettlement(s.id, actor);
    await approveSettlement(s.id, actor);
    await finalizeSettlement(s.id, actor);
    finalized += 1;
  }
  const sept = await prepareMonth({ settlementMonth: '2026-09' }, actor);
  console.log(
    `  settlements: Aug ${august.length} (${finalized} finalized), Sep ${sept.created} calculated drafts`,
  );
}

/** Payments for finalized August settlements: first fully paid, then half-paid, rest unpaid. */
async function seedPayments(actor) {
  if ((await prisma.driverPayment.count()) > 0) {
    console.log('  payments already present — skipped');
    return;
  }
  const finalized = await prisma.driverSettlement.findMany({
    where: { settlementMonth: '2026-08', status: 'FINALIZED' },
    orderBy: { id: 'asc' },
  });
  const methods = ['BANK_TRANSFER', 'UPI', 'CASH'];
  let count = 0;
  for (const [i, s] of finalized.entries()) {
    if (i > 1) break; // leave the rest unpaid
    const amount = i === 0 ? s.finalAmount : s.finalAmount.dividedBy(2).toDecimalPlaces(2);
    await recordPayment(
      s.id,
      {
        amount: amount.toFixed(2),
        paymentDate: '2026-09-07',
        paymentMethod: methods[i],
        referenceNumber: `DEV-PAY-${s.id}`,
      },
      actor,
    );
    count += 1;
  }
  console.log(`  ${count} driver payments`);
}

/** Company attribution for finalized settlements that predate Phase 11 (idempotent). */
async function backfillAllocations() {
  const missing = await prisma.driverSettlement.findMany({
    where: { status: 'FINALIZED', allocations: { none: {} } },
  });
  for (const s of missing) await prisma.$transaction((tx) => allocateSettlement(tx, s));
  if (missing.length)
    console.log(`  allocated ${missing.length} finalized settlement(s) to companies`);
}

/** Illustrative tax rate and GST records. Rates are placeholders an Admin must verify. */
async function seedGst(actor) {
  if (await prisma.gstRecord.count()) return;
  const rate =
    (await prisma.taxRateConfig.findFirst({ where: { hsnSac: '996601' } })) ??
    (await createTaxRate(
      {
        hsnSac: '996601',
        description: 'Rental of motor vehicles with operator (verify rate with tax advisor)',
        gstRate: '5',
        cessRate: '0',
        effectiveFrom: '2026-04-01',
      },
      actor,
    ));
  const companies = await prisma.company.findMany({ orderBy: { id: 'asc' }, take: 2 });
  let n = 0;
  for (const c of companies) {
    n += 1;
    await createGstRecord(
      {
        direction: 'OUTWARD',
        companyId: c.id,
        counterpartyName: c.name,
        counterpartyGstin: c.gstin ?? undefined,
        invoiceNumber: `LV/26-27/DEV-${n}`,
        invoiceDate: '2026-08-31',
        hsnSac: '996601',
        taxableValue: String(250000 * n),
        taxRate: '5',
        cessRate: '0',
        supplyType: 'INTRA_STATE',
        placeOfSupply: c.gstin?.slice(0, 2) ?? '29',
        reverseCharge: false,
        taxRateConfigId: rate.id,
      },
      actor,
    );
  }
  console.log(`  ${n} GST record(s)`);
}

export async function seedDevelopmentData(actor) {
  console.log('Seeding development data…');
  await seedMasterData(actor);
  await seedCompanySettlements(actor);
  await seedTrips(actor);
  await seedEarnings(actor);
  await seedExpensesAndAdvances(actor);
  await seedSettlements(actor);
  await seedPayments(actor);
  await backfillAllocations();
  await seedGst(actor);
}
