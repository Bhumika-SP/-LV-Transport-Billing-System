import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { patch, post } from '../../lib/api';
import { toFormValues, v } from '../../lib/forms';

const FIELDS = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Sedan', full: true },
  { name: 'description', label: 'Description', type: 'textarea' },
];

const schema = z.object({ name: v.required('Name'), description: v.optional() });

export default function VehicleTypeFormModal({ open, onClose, vehicleType, onSaved }) {
  const initialValues = useMemo(
    () => toFormValues(vehicleType, ['name', 'description']),
    [vehicleType],
  );
  return (
    <EntityFormModal
      open={open}
      onClose={onClose}
      size="md"
      title={vehicleType ? `Edit ${vehicleType.name}` : 'New vehicle type'}
      fields={FIELDS}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) =>
        vehicleType
          ? patch(`/vehicle-types/${vehicleType.id}`, values)
          : post('/vehicle-types', values)
      }
      submitLabel={vehicleType ? 'Save changes' : 'Create type'}
      successMessage={vehicleType ? 'Vehicle type updated' : 'Vehicle type created'}
      invalidateKeys={[['vehicle-types']]}
      onSuccess={onSaved}
    />
  );
}
