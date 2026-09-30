/**
 * The two assignment histories share one service. Each kind declares its table,
 * the two parties, and which overlap rules apply (each rule is CONFIGURABLE through
 * a setting; default = no overlapping assignments).
 */
export const ASSIGNMENT_KINDS = {
  vehicle: {
    entityType: 'VehicleAssignment',
    delegate: 'vehicleAssignment',
    parties: [
      { field: 'vehicleId', model: 'vehicle', table: 'vehicles', label: 'Vehicle' },
      { field: 'companyId', model: 'company', table: 'companies', label: 'Company' },
    ],
    include: {
      vehicle: { select: { id: true, registrationNumber: true } },
      company: { select: { id: true, name: true } },
    },
    overlapRules: [
      {
        field: 'vehicleId',
        setting: 'assignments.allowConcurrentCompaniesPerVehicle',
        message: 'This vehicle is already assigned to a company for overlapping dates',
      },
    ],
  },
  driver: {
    entityType: 'DriverAssignment',
    delegate: 'driverAssignment',
    parties: [
      { field: 'driverId', model: 'driver', table: 'drivers', label: 'Driver' },
      { field: 'vehicleId', model: 'vehicle', table: 'vehicles', label: 'Vehicle' },
    ],
    include: {
      driver: { select: { id: true, fullName: true, driverCode: true } },
      vehicle: { select: { id: true, registrationNumber: true } },
    },
    overlapRules: [
      {
        field: 'driverId',
        setting: 'assignments.allowConcurrentVehiclesPerDriver',
        message: 'This driver is already assigned to a vehicle for overlapping dates',
      },
      {
        field: 'vehicleId',
        setting: 'assignments.allowConcurrentDriversPerVehicle',
        message: 'This vehicle already has a driver assigned for overlapping dates',
      },
    ],
  },
};
