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
import { createDriver } from '../src/modules/drivers/drivers.service.js';
import { createRate } from '../src/modules/rates/rates.service.js';
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

export async function seedDevelopmentData(actor) {
  console.log('Seeding development data…');
  await seedMasterData(actor);
}
