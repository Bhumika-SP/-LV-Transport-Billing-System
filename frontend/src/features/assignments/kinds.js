/** UI configuration for the two assignment histories (mirrors the backend kinds). */
export const KINDS = {
  vehicle: {
    path: 'vehicles',
    title: 'Vehicle → Company',
    parties: [
      { field: 'vehicleId', label: 'Vehicle', resource: 'vehicles' },
      { field: 'companyId', label: 'Company', resource: 'companies' },
    ],
    describe: (a) => `${a.vehicle.registrationNumber} → ${a.company.name}`,
  },
  driver: {
    path: 'drivers',
    title: 'Driver → Vehicle',
    parties: [
      { field: 'driverId', label: 'Driver', resource: 'drivers' },
      { field: 'vehicleId', label: 'Vehicle', resource: 'vehicles' },
    ],
    describe: (a) => `${a.driver.fullName} → ${a.vehicle.registrationNumber}`,
  },
};
