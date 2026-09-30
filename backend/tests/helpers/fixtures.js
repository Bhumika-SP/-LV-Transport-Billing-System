import { prisma } from './db.js';

/** Direct-to-DB fixtures for test setup (fast; business rules are tested via the API). */

const d = (s) => new Date(`${s}T00:00:00.000Z`);

export function makeCompany(data = {}) {
  return prisma.company.create({ data: { name: 'Infosys', code: 'INFY', ...data } });
}

let driverSeq = 0;
export function makeDriver(data = {}) {
  driverSeq += 1;
  return prisma.driver.create({
    data: {
      fullName: `Driver ${driverSeq}`,
      driverCode: `T-${driverSeq}-${Date.now() % 100000}`,
      phone: '9876543210',
      ...data,
    },
  });
}

export function makeVehicleType(data = {}) {
  return prisma.vehicleType.create({ data: { name: 'Sedan', ...data } });
}

export function makeRate(vehicleTypeId, ratePerKm, from, to = null) {
  return prisma.vehicleTypeRate.create({
    data: { vehicleTypeId, ratePerKm, effectiveFrom: d(from), effectiveTo: to ? d(to) : null },
  });
}

let regSeq = 1000;
export function makeVehicle(vehicleTypeId, data = {}) {
  regSeq += 1;
  return prisma.vehicle.create({
    data: { registrationNumber: `KA01AB${regSeq}`, vehicleTypeId, ...data },
  });
}

export function assignVehicle(vehicleId, companyId, start, end = null) {
  return prisma.vehicleAssignment.create({
    data: { vehicleId, companyId, startDate: d(start), endDate: end ? d(end) : null },
  });
}

export function assignDriver(driverId, vehicleId, start, end = null) {
  return prisma.driverAssignment.create({
    data: { driverId, vehicleId, startDate: d(start), endDate: end ? d(end) : null },
  });
}
