import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { patch, post } from '../../lib/api';
import { toFormValues, v } from '../../lib/forms';

const FIELDS = [
  { name: 'name', label: 'Company name', required: true },
  { name: 'code', label: 'Code', placeholder: 'e.g. INFY', hint: 'Optional short code, unique' },
  { name: 'contactPerson', label: 'Contact person' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'gstin', label: 'GSTIN', placeholder: '15 characters', hint: 'If applicable' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const schema = z.object({
  name: v.required('Company name'),
  code: v.optionalMatch(/^[A-Za-z0-9-]{2,20}$/, 'Use 2–20 letters, digits or hyphens'),
  contactPerson: v.optional(),
  phone: v.optionalPhone(),
  email: v.optionalEmail(),
  gstin: v.optionalMatch(
    /^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/,
    'Enter a valid 15-character GSTIN',
  ),
  address: v.optional(),
  notes: v.optional(),
});

export default function CompanyFormModal({ open, onClose, company, onSaved }) {
  const initialValues = useMemo(
    () =>
      toFormValues(
        company,
        FIELDS.map((f) => f.name),
      ),
    [company],
  );

  return (
    <EntityFormModal
      open={open}
      onClose={onClose}
      title={company ? `Edit ${company.name}` : 'New company'}
      fields={FIELDS}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) =>
        company ? patch(`/companies/${company.id}`, values) : post('/companies', values)
      }
      submitLabel={company ? 'Save changes' : 'Create company'}
      successMessage={company ? 'Company updated' : 'Company created'}
      invalidateKeys={[['companies']]}
      onSuccess={onSaved}
    />
  );
}
