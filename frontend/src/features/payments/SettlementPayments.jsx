import { Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '../../auth/auth-context';
import EntityFormModal from '../../components/EntityFormModal';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { post } from '../../lib/api';
import { formatDate, formatINR, today } from '../../lib/format';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel, v } from '../../lib/forms';
import { useReversePayment } from './usePayments';

/** Payments on one settlement: history, record (finalized + outstanding), reverse. */
export default function SettlementPayments({ settlement: s }) {
  const { can } = useAuth();
  const [recording, setRecording] = useState(false);
  const [reversing, setReversing] = useState(null);
  const reverse = useReversePayment(() => setReversing(null));
  const outstanding = s.outstandingAmount;
  const payable = s.status === 'FINALIZED' && outstanding && Number(outstanding) > 0;

  const initialValues = useMemo(
    () => ({
      amount: outstanding ?? '',
      paymentDate: today(),
      paymentMethod: '',
      referenceNumber: '',
      notes: '',
    }),
    [outstanding],
  );

  return (
    <Card
      title="Payments"
      actions={
        payable &&
        can(PERMISSIONS.PAYMENT_RECORD) && (
          <Button size="sm" icon={Plus} onClick={() => setRecording(true)}>
            Record payment
          </Button>
        )
      }
    >
      <DataTable
        rows={s.payments}
        empty={<EmptyState title="No payments yet" />}
        columns={[
          { key: 'paymentDate', header: 'Date', render: (p) => formatDate(p.paymentDate) },
          {
            key: 'paymentMethod',
            header: 'Method',
            render: (p) => paymentMethodLabel(p.paymentMethod),
          },
          { key: 'referenceNumber', header: 'Reference' },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (p) => (
              <span className={p.status === 'REVERSED' ? 'text-slate-400 line-through' : ''}>
                {formatINR(p.amount)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (p) => (
              <StatusBadge status={p.status === 'REVERSED' ? 'CANCELLED' : 'ACTIVE'} />
            ),
          },
          ...(can(PERMISSIONS.PAYMENT_REVERSE)
            ? [
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (p) =>
                    p.status === 'VALID' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={RotateCcw}
                        onClick={() => setReversing(p)}
                        aria-label="Reverse payment"
                      />
                    ),
                },
              ]
            : []),
        ]}
      />
      <EntityFormModal
        open={recording}
        onClose={() => setRecording(false)}
        size="md"
        title={`Record payment — outstanding ${formatINR(outstanding)}`}
        fields={[
          { name: 'amount', label: 'Amount (₹)', required: true, inputMode: 'decimal' },
          { name: 'paymentDate', label: 'Payment date', type: 'date', required: true },
          {
            name: 'paymentMethod',
            label: 'Method',
            type: 'select',
            required: true,
            placeholder: 'Select method',
            options: PAYMENT_METHOD_OPTIONS,
          },
          {
            name: 'referenceNumber',
            label: 'Reference number',
            hint: 'UTR / UPI ref / cheque number',
          },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        schema={z.object({
          amount: v
            .amount('Amount')
            .refine((a) => Number(a) > 0, 'Amount must be greater than zero')
            .refine(
              (a) => Number(a) <= Number(outstanding),
              'Cannot exceed the outstanding amount',
            ),
          paymentDate: v
            .required('Payment date')
            .refine((d) => d <= today(), 'Cannot be in the future'),
          paymentMethod: v.required('Method'),
          referenceNumber: v.optional(),
          notes: v.optional(),
        })}
        initialValues={initialValues}
        onSubmit={(values) => post('/payments', { ...values, settlementId: s.id })}
        submitLabel="Record payment"
        successMessage="Payment recorded"
        invalidateKeys={[['settlements'], ['payments']]}
      />
      <ConfirmDialog
        open={Boolean(reversing)}
        onClose={() => setReversing(null)}
        title="Reverse payment"
        message={`Reverse ${formatINR(reversing?.amount)}? The record is kept and the outstanding amount is restored.`}
        confirmLabel="Reverse"
        requireReason
        loading={reverse.isPending}
        onConfirm={(reason) => reverse.mutate({ id: reversing.id, reason })}
      />
    </Card>
  );
}
