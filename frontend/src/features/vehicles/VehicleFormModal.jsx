import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { patch, post } from '../../lib/api';
import { toFormValues, v } from '../../lib/forms';

const FUEL_OPTIONS = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER'].map((f) => ({
  value: f,
  label: f.charAt(0) + f.slice(1).toLowerCase(),
}));

const NAMES = [
  'registrationNumber',
  'vehicleTypeId',
  'make',
  'model',
  'year',
  'fuelType',
  'insuranceProvider',
  'insurancePolicyNumber',
  'insuranceExpiryDate',
  'fitnessCertificateNumber',
  'fitnessExpiryDate',
  'permitNumber',
  'permitExpiryDate',
  'notes',
];

const schema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .refine(
      (s) => /^[A-Z0-9]{4,15}$/.test(s.toUpperCase().replace(/[\s-]/g, '')),
      'Enter a valid registration number',
    ),
  vehicleTypeId: v.required('Vehicle type'),
  make: v.optional(),
  model: v.optional(),
  year: v.optionalMatch(/^(19[89]\d|20\d\d)$/, 'Enter a valid year'),
  fuelType: v.optional(),
  insuranceProvider: v.optional(),
  insurancePolicyNumber: v.optional(),
  insuranceExpiryDate: v.optional(),
  fitnessCertificateNumber: v.optional(),
  fitnessExpiryDate: v.optional(),
  permitNumber: v.optional(),
  permitExpiryDate: v.optional(),
  notes: v.optional(),
});

export default function VehicleFormModal({ open, onClose, vehicle, onSaved }) {
  const types = useOptions('vehicle-types', { enabled: open });
  const initialValues = useMemo(() => toFormValues(vehicle, NAMES), [vehicle]);

  const fields = [
    {
      name: 'registrationNumber',
      label: 'Registration number',
      required: true,
      placeholder: 'KA 01 AB 1234',
      section: 'Vehicle',
    },
    {
      name: 'vehicleTypeId',
      label: 'Vehicle type',
      type: 'select',
      required: true,
      placeholder: 'Select type',
      options: (types.data ?? []).map(toSelect['vehicle-types']),
      hint: 'Determines the per-km rate',
    },
    { name: 'make', label: 'Make' },
    { name: 'model', label: 'Model' },
    { name: 'year', label: 'Year', inputMode: 'numeric' },
    { name: 'fuelType', label: 'Fuel type', type: 'select', options: FUEL_OPTIONS },
    { name: 'insuranceProvider', label: 'Insurance provider', section: 'Insurance' },
    { name: 'insurancePolicyNumber', label: 'Policy number' },
    { name: 'insuranceExpiryDate', label: 'Insurance expiry', type: 'date' },
    {
      name: 'fitnessCertificateNumber',
      label: 'Fitness certificate no.',
      section: 'Fitness & permit',
    },
    { name: 'fitnessExpiryDate', label: 'Fitness expiry', type: 'date' },
    { name: 'permitNumber', label: 'Permit number' },
    { name: 'permitExpiryDate', label: 'Permit expiry', type: 'date' },
    { name: 'notes', label: 'Notes', type: 'textarea', section: 'Other' },
  ];

  return (
    <EntityFormModal
      open={open && !types.isLoading}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.registrationNumber}` : 'New vehicle'}
      fields={fields}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) =>
        vehicle ? patch(`/vehicles/${vehicle.id}`, values) : post('/vehicles', values)
      }
      submitLabel={vehicle ? 'Save changes' : 'Create vehicle'}
      successMessage={vehicle ? 'Vehicle updated' : 'Vehicle created'}
      invalidateKeys={[['vehicles'], ['vehicle-types']]}
      onSuccess={onSaved}
    />
  );
}
