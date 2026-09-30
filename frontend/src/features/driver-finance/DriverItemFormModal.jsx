import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { post } from '../../lib/api';
import { today } from '../../lib/format';
import { v } from '../../lib/forms';

/**
 * Create a driver line item (earning, adjustment, expense…).
 * config: { resource, title, types:[{value,label}], dateField, textField, textLabel,
 *           extraFields?: [field], extraSchema?: {}, extraDefaults?: {}, transform?(values) }
 */
export default function DriverItemFormModal({ open, onClose, config, driverId, defaultType }) {
  const drivers = useOptions('drivers', { enabled: open && !driverId });
  const initialValues = useMemo(
    () => ({
      driverId: driverId ? String(driverId) : '',
      type: defaultType ?? config.types[0].value,
      amount: '',
      [config.dateField]: today(),
      settlementMonth: '',
      [config.textField]: '',
      ...config.extraDefaults,
    }),
    [driverId, defaultType, config],
  );

  const fields = [
    ...(driverId
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
    ...(config.types.length > 1
      ? [{ name: 'type', label: 'Type', type: 'select', required: true, options: config.types }]
      : []),
    ...(config.extraFields ?? []),
    { name: 'amount', label: 'Amount (₹)', required: true, inputMode: 'decimal' },
    { name: config.dateField, label: 'Date', type: 'date', required: true },
    {
      name: 'settlementMonth',
      label: 'Settlement month',
      type: 'month',
      hint: 'Leave blank to use the month of the date',
    },
    { name: config.textField, label: config.textLabel, type: 'textarea', required: true },
  ];

  const schema = z.object({
    driverId: v.required('Driver'),
    type: v.required('Type'),
    amount: v.amount().refine((s) => Number(s) > 0, 'Amount must be greater than zero'),
    [config.dateField]: v.required('Date'),
    settlementMonth: v.optional(),
    [config.textField]: z.string().trim().min(3, `${config.textLabel} is required`),
    ...config.extraSchema,
  });

  return (
    <EntityFormModal
      open={open && (Boolean(driverId) || !drivers.isLoading)}
      onClose={onClose}
      size="md"
      title={config.title}
      fields={fields}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) => {
        const body = { ...values, settlementMonth: values.settlementMonth || undefined };
        return post(`/${config.resource}`, config.transform ? config.transform(body) : body);
      }}
      submitLabel="Save"
      successMessage="Saved"
      invalidateKeys={[[config.resource], ['earnings-gross'], ['settlements']]}
    />
  );
}
