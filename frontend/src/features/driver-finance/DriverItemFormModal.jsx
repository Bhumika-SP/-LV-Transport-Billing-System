import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { post } from '../../lib/api';
import { today } from '../../lib/format';
import { v } from '../../lib/forms';

/**
 * Create a driver line item (earning, adjustment, expense…).
 * config: { resource, title, types:[{value,label}], typeField?, typeLabel?, dateField,
 *           textField, textLabel, withVehicle?, withReceipt? }
 * `fixed` pins values (e.g. { driverId } or { vehicleId }) and hides those inputs.
 */
export default function DriverItemFormModal({ open, onClose, config, fixed = {} }) {
  const typeField = config.typeField ?? 'type';
  const drivers = useOptions('drivers', { enabled: open && !fixed.driverId });
  const vehicles = useOptions('vehicles', {
    enabled: open && config.withVehicle && !fixed.vehicleId,
  });

  const initialValues = useMemo(
    () => ({
      driverId: fixed.driverId ? String(fixed.driverId) : '',
      ...(config.withVehicle && { vehicleId: fixed.vehicleId ? String(fixed.vehicleId) : '' }),
      [typeField]: fixed[typeField] ?? fixed.type ?? config.types[0].value,
      amount: '',
      [config.dateField]: today(),
      settlementMonth: '',
      [config.textField]: '',
      ...(config.withReceipt && { receiptReference: '' }),
    }),
    [fixed, config, typeField],
  );

  const fields = [
    ...(fixed.driverId
      ? []
      : [
          {
            name: 'driverId',
            label: 'Driver',
            type: 'select',
            required: true,
            placeholder: 'Select driver',
            options: (drivers.data ?? []).map(toSelect.drivers),
          },
        ]),
    ...(config.withVehicle && !fixed.vehicleId
      ? [
          {
            name: 'vehicleId',
            label: 'Vehicle',
            type: 'select',
            required: true,
            placeholder: 'Select vehicle',
            options: (vehicles.data ?? []).map(toSelect.vehicles),
          },
        ]
      : []),
    ...(config.types.length > 1 && !fixed[typeField] && !fixed.type
      ? [
          {
            name: typeField,
            label: config.typeLabel ?? 'Type',
            type: 'select',
            required: true,
            options: config.types,
          },
        ]
      : []),
    { name: 'amount', label: 'Amount (₹)', required: true, inputMode: 'decimal' },
    { name: config.dateField, label: 'Date', type: 'date', required: true },
    {
      name: 'settlementMonth',
      label: 'Settlement month',
      type: 'month',
      hint: 'Leave blank to use the month of the date',
    },
    ...(config.withReceipt ? [{ name: 'receiptReference', label: 'Receipt / bill number' }] : []),
    { name: config.textField, label: config.textLabel, type: 'textarea', required: true },
  ];

  const schema = z.object({
    driverId: v.required('Driver'),
    ...(config.withVehicle && { vehicleId: v.required('Vehicle') }),
    [typeField]: v.required(config.typeLabel ?? 'Type'),
    amount: v.amount().refine((s) => Number(s) > 0, 'Amount must be greater than zero'),
    [config.dateField]: v.required('Date'),
    settlementMonth: v.optional(),
    ...(config.withReceipt && { receiptReference: v.optional() }),
    [config.textField]: z.string().trim().min(3, `${config.textLabel} is required`),
  });

  const loading =
    (!fixed.driverId && drivers.isLoading) ||
    (config.withVehicle && !fixed.vehicleId && vehicles.isLoading);

  return (
    <EntityFormModal
      open={open && !loading}
      onClose={onClose}
      size="md"
      title={config.title}
      fields={fields}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) =>
        post(`/${config.resource}`, {
          ...values,
          settlementMonth: values.settlementMonth || undefined,
        })
      }
      submitLabel="Save"
      successMessage="Saved"
      invalidateKeys={[[config.resource], ['earnings-gross'], ['settlements']]}
    />
  );
}
