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
import { createRate } from '../src/modules/rates/rates.service.js';
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

export async function seedDevelopmentData(actor) {
  console.log('Seeding development data…');
  await seedMasterData(actor);
  await seedCompanySettlements(actor);
  await seedTrips(actor);
  await seedEarnings(actor);
}
