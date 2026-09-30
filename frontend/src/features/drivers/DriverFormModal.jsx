import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { patch, post } from '../../lib/api';
import { toFormValues, v } from '../../lib/forms';

const FIELDS = [
  { name: 'fullName', label: 'Full name', required: true, section: 'Personal' },
  { name: 'driverCode', label: 'Driver code', hint: 'Leave blank to auto-generate (DRV-0001)' },
  { name: 'phone', label: 'Phone', type: 'tel', required: true },
  { name: 'alternatePhone', label: 'Alternate phone', type: 'tel' },
  { name: 'joiningDate', label: 'Date of joining', type: 'date' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'licenseNumber', label: 'Licence number', section: 'Licence' },
  { name: 'licenseExpiryDate', label: 'Licence expiry', type: 'date' },
  { name: 'bankAccountName', label: 'Account holder name', section: 'Payment details' },
  { name: 'bankAccountNumber', label: 'Account number', inputMode: 'numeric' },
  { name: 'bankIfsc', label: 'IFSC' },
  { name: 'bankName', label: 'Bank name' },
  { name: 'upiId', label: 'UPI ID', placeholder: 'name@bank' },
  { name: 'notes', label: 'Notes', type: 'textarea', section: 'Other' },
];

const schema = z.object({
  fullName: v.required('Full name'),
  driverCode: v.optionalMatch(/^[A-Za-z0-9-]{2,20}$/, 'Use 2–20 letters, digits or hyphens'),
  phone: v.phone(),
  alternatePhone: v.optionalPhone(),
  joiningDate: v.optional(),
  address: v.optional(),
  licenseNumber: v.optionalMatch(/^[A-Za-z0-9 -]{6,30}$/, 'Enter a valid licence number'),
  licenseExpiryDate: v.optional(),
  bankAccountName: v.optional(),
  bankAccountNumber: v.optionalMatch(/^[0-9]{6,20}$/, 'Account number must be 6–20 digits'),
  bankIfsc: v.optionalMatch(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid 11-character IFSC'),
  bankName: v.optional(),
  upiId: v.optionalMatch(/^[\w.-]{2,}@[a-zA-Z][a-zA-Z0-9.-]+$/, 'Enter a valid UPI ID'),
  notes: v.optional(),
});

export default function DriverFormModal({ open, onClose, driver, onSaved }) {
  const initialValues = useMemo(
    () =>
      toFormValues(
        driver,
        FIELDS.map((f) => f.name),
      ),
    [driver],
  );

  return (
    <EntityFormModal
      open={open}
      onClose={onClose}
      title={driver ? `Edit ${driver.fullName}` : 'New driver'}
      fields={FIELDS}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) => {
        // A blank code on edit means "keep the current code".
        const body = driver && !values.driverCode ? { ...values, driverCode: undefined } : values;
        return driver ? patch(`/drivers/${driver.id}`, body) : post('/drivers', body);
      }}
      submitLabel={driver ? 'Save changes' : 'Create driver'}
      successMessage={driver ? 'Driver updated' : 'Driver created'}
      invalidateKeys={[['drivers']]}
      onSuccess={onSaved}
    />
  );
}
