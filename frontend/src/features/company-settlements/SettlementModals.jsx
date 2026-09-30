import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { patch, post } from '../../lib/api';
import { currentMonth, formatINR, formatMonth, today } from '../../lib/format';
import { PAYMENT_METHOD_OPTIONS, v } from '../../lib/forms';

const INVALIDATE = [['company-settlements'], ['companies']];
const positive = (label) =>
  v.amount(label).refine((s) => Number(s) > 0, `${label} must be greater than zero`);
const reason = z.string().trim().min(3, 'A reason is required');
const notFuture = (s) => !s || s <= today();

/** New monthly settlement, recorded as PENDING with its expected amount. */
export function CreateSettlementModal({ open, onClose, companyId }) {
  const companies = useOptions('companies', { enabled: open && !companyId });
  const initialValues = useMemo(
    () => ({
      companyId: companyId ? String(companyId) : '',
      settlementMonth: currentMonth(),
      expectedAmount: '',
      notes: '',
    }),
    [companyId],
  );
  const fields = [
    ...(companyId
      ? []
      : [
          {
            name: 'companyId',
            label: 'Company',
            type: 'select',
            required: true,
            placeholder: 'Select company',
            options: (companies.data ?? []).map(toSelect.companies),
          },
        ]),
    { name: 'settlementMonth', label: 'Settlement month', type: 'month', required: true },
    { name: 'expectedAmount', label: 'Expected amount (₹)', required: true, inputMode: 'decimal' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return (
    <EntityFormModal
      open={open && (Boolean(companyId) || !companies.isLoading)}
      onClose={onClose}
      size="md"
      title="Record monthly company settlement"
      fields={fields}
      schema={z.object({
        companyId: v.required('Company'),
        settlementMonth: v.required('Settlement month'),
        expectedAmount: positive('Expected amount'),
        notes: v.optional(),
      })}
      initialValues={initialValues}
      onSubmit={(values) => post('/company-settlements', values)}
      submitLabel="Save as pending"
      successMessage="Settlement recorded as PENDING"
      invalidateKeys={INVALIDATE}
    />
  );
}

/** Edit expected amount / notes while PENDING. */
export function EditPendingModal({ settlement, onClose }) {
  const initialValues = useMemo(
    () => ({ expectedAmount: settlement?.expectedAmount ?? '', notes: settlement?.notes ?? '' }),
    [settlement],
  );
  return (
    <EntityFormModal
      open={Boolean(settlement)}
      onClose={onClose}
      size="md"
      title={`Edit ${settlement?.company.name} — ${formatMonth(settlement?.settlementMonth)}`}
      fields={[
        {
          name: 'expectedAmount',
          label: 'Expected amount (₹)',
          required: true,
          inputMode: 'decimal',
        },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      schema={z.object({ expectedAmount: positive('Expected amount'), notes: v.optional() })}
      initialValues={initialValues}
      onSubmit={(values) => patch(`/company-settlements/${settlement.id}`, values)}
      successMessage="Settlement updated"
      invalidateKeys={INVALIDATE}
    />
  );
}

const receiptFields = [
  { name: 'receivedAmount', label: 'Amount received (₹)', required: true, inputMode: 'decimal' },
  { name: 'receivedDate', label: 'Received date', type: 'date', required: true },
  {
    name: 'paymentMethod',
    label: 'Payment method',
    type: 'select',
    required: true,
    placeholder: 'Select method',
    options: PAYMENT_METHOD_OPTIONS,
  },
  { name: 'referenceNumber', label: 'Reference number', hint: 'UTR / UPI ref / cheque number' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

/** PENDING → RECEIVED: record what LV actually received. */
export function ReceiveModal({ settlement, onClose }) {
  const initialValues = useMemo(
    () => ({
      receivedAmount: settlement?.expectedAmount ?? '',
      receivedDate: today(),
      paymentMethod: '',
      referenceNumber: '',
      notes: settlement?.notes ?? '',
    }),
    [settlement],
  );
  return (
    <EntityFormModal
      open={Boolean(settlement)}
      onClose={onClose}
      size="md"
      title={`Mark received — ${settlement?.company.name}, ${formatMonth(settlement?.settlementMonth)}`}
      fields={[
        {
          ...receiptFields[0],
          hint: settlement
            ? `Expected ${formatINR(settlement.expectedAmount)}. Enter the actual amount received.`
            : undefined,
        },
        ...receiptFields.slice(1),
      ]}
      schema={z.object({
        receivedAmount: positive('Amount received'),
        receivedDate: v.required('Received date').refine(notFuture, 'Cannot be in the future'),
        paymentMethod: v.required('Payment method'),
        referenceNumber: v.optional(),
        notes: v.optional(),
      })}
      initialValues={initialValues}
      onSubmit={(values) => post(`/company-settlements/${settlement.id}/receive`, values)}
      submitLabel="Mark as received"
      successMessage="Settlement marked RECEIVED"
      invalidateKeys={INVALIDATE}
    />
  );
}

/** Admin correction of a RECEIVED settlement (reason required, audited). */
export function CorrectModal({ settlement, onClose }) {
  const initialValues = useMemo(
    () => ({
      expectedAmount: settlement?.expectedAmount ?? '',
      receivedAmount: settlement?.receivedAmount ?? '',
      receivedDate: settlement?.receivedDate ?? '',
      paymentMethod: settlement?.paymentMethod ?? '',
      referenceNumber: settlement?.referenceNumber ?? '',
      notes: settlement?.notes ?? '',
      reason: '',
    }),
    [settlement],
  );
  return (
    <EntityFormModal
      open={Boolean(settlement)}
      onClose={onClose}
      size="md"
      title={`Correct received settlement — ${settlement?.company.name}, ${formatMonth(settlement?.settlementMonth)}`}
      fields={[
        {
          name: 'expectedAmount',
          label: 'Expected amount (₹)',
          required: true,
          inputMode: 'decimal',
        },
        ...receiptFields,
        { name: 'reason', label: 'Reason for correction', type: 'textarea', required: true },
      ]}
      schema={z.object({
        expectedAmount: positive('Expected amount'),
        receivedAmount: positive('Amount received'),
        receivedDate: v.required('Received date').refine(notFuture, 'Cannot be in the future'),
        paymentMethod: v.required('Payment method'),
        referenceNumber: v.optional(),
        notes: v.optional(),
        reason,
      })}
      initialValues={initialValues}
      onSubmit={(values) => post(`/company-settlements/${settlement.id}/correct`, values)}
      submitLabel="Save correction"
      successMessage="Correction saved"
      invalidateKeys={INVALIDATE}
    />
  );
}
