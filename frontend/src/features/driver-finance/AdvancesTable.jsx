import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../../auth/auth-context';
import EntityFormModal from '../../components/EntityFormModal';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import Stat from '../../components/ui/Stat';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get, post } from '../../lib/api';
import { currentMonth, formatDate, formatINR, formatMonth, today } from '../../lib/format';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel, v } from '../../lib/forms';

const positive = (label) =>
  v.amount(label).refine((s) => Number(s) > 0, `${label} must be greater than zero`);
const INVALIDATE = [['advances'], ['settlements']];

function NewAdvanceModal({ open, onClose, driverId }) {
  const drivers = useOptions('drivers', { enabled: open && !driverId });
  const initialValues = useMemo(
    () => ({
      driverId: driverId ? String(driverId) : '',
      amount: '',
      advanceDate: today(),
      paymentMethod: '',
      referenceNumber: '',
      reason: '',
    }),
    [driverId],
  );
  return (
    <EntityFormModal
      open={open && (Boolean(driverId) || !drivers.isLoading)}
      onClose={onClose}
      size="md"
      title="Record advance paid to driver"
      fields={[
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
        { name: 'amount', label: 'Amount (₹)', required: true, inputMode: 'decimal' },
        { name: 'advanceDate', label: 'Date paid', type: 'date', required: true },
        {
          name: 'paymentMethod',
          label: 'Payment method',
          type: 'select',
          required: true,
          placeholder: 'Select method',
          options: PAYMENT_METHOD_OPTIONS,
        },
        { name: 'referenceNumber', label: 'Reference number' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true },
      ]}
      schema={z.object({
        driverId: v.required('Driver'),
        amount: positive('Amount'),
        advanceDate: v.required('Date').refine((d) => d <= today(), 'Cannot be in the future'),
        paymentMethod: v.required('Payment method'),
        referenceNumber: v.optional(),
        reason: z.string().trim().min(3, 'Reason is required'),
      })}
      initialValues={initialValues}
      onSubmit={(values) => post('/advances', values)}
      submitLabel="Record advance"
      successMessage="Advance recorded"
      invalidateKeys={INVALIDATE}
    />
  );
}

/** Recovery history for one advance, record a recovery, void a recovery. */
function AdvanceDetailModal({ advance, onClose }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(PERMISSIONS.ADVANCE_MANAGE);
  const [recovering, setRecovering] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const { data } = useQuery({
    queryKey: ['advances', advance?.id],
    queryFn: () => get(`/advances/${advance.id}`),
    enabled: Boolean(advance),
  });
  const a = data ?? advance;
  const initialValues = useMemo(
    () => ({ amount: '', settlementMonth: currentMonth(), notes: '' }),
    [],
  );

  const voidRecovery = useMutation({
    mutationFn: ({ id, reason }) => post(`/advances/recoveries/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Recovery voided; balance restored');
      INVALIDATE.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      setVoiding(null);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!a) return null;
  return (
    <Modal
      open={Boolean(advance)}
      onClose={onClose}
      size="lg"
      title={`Advance — ${a.driver.fullName}, ${formatDate(a.advanceDate)}`}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Advance" value={formatINR(a.amount)} />
        <Stat label="Recovered" value={formatINR(a.recoveredAmount)} tone="positive" />
        <Stat
          label="Outstanding"
          value={formatINR(a.outstandingAmount)}
          tone={a.outstandingAmount === '0.00' ? 'muted' : 'warning'}
        />
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {a.reason} · paid by {paymentMethodLabel(a.paymentMethod)}
        {a.referenceNumber && ` (${a.referenceNumber})`}
      </p>
      <div className="rounded-md border border-slate-200">
        <DataTable
          rows={a.recoveries}
          empty={<EmptyState title="No recoveries yet" />}
          columns={[
            {
              key: 'settlementMonth',
              header: 'Settlement month',
              render: (r) => formatMonth(r.settlementMonth),
            },
            {
              key: 'amount',
              header: 'Recovered',
              align: 'right',
              render: (r) => (
                <span className={r.status === 'VOID' ? 'text-slate-400 line-through' : ''}>
                  {formatINR(r.amount)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={r.status === 'VOID' ? 'CANCELLED' : 'ACTIVE'} />,
            },
            {
              key: 'notes',
              header: 'Notes',
              render: (r) => (r.status === 'VOID' ? `Voided: ${r.voidReason}` : (r.notes ?? '—')),
            },
            ...(canManage
              ? [
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    align: 'right',
                    render: (r) =>
                      r.status === 'ACTIVE' && (
                        <Button size="sm" variant="ghost" icon={Ban} onClick={() => setVoiding(r)}>
                          Void
                        </Button>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      {canManage && a.status === 'OPEN' && (
        <Button className="mt-4" icon={Plus} onClick={() => setRecovering(true)}>
          Record recovery
        </Button>
      )}
      <EntityFormModal
        open={recovering}
        onClose={() => setRecovering(false)}
        size="sm"
        title="Record advance recovery"
        fields={[
          {
            name: 'amount',
            label: 'Amount to recover (₹)',
            required: true,
            inputMode: 'decimal',
            hint: `Outstanding ${formatINR(a.outstandingAmount)}`,
          },
          {
            name: 'settlementMonth',
            label: 'Deduct in settlement month',
            type: 'month',
            required: true,
          },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        schema={z.object({
          amount: positive('Amount').refine(
            (s) => Number(s) <= Number(a.outstandingAmount),
            'Cannot exceed the outstanding balance',
          ),
          settlementMonth: v.required('Settlement month'),
          notes: v.optional(),
        })}
        initialValues={initialValues}
        onSubmit={(values) => post(`/advances/${a.id}/recoveries`, values)}
        submitLabel="Record recovery"
        successMessage="Recovery recorded"
        invalidateKeys={INVALIDATE}
      />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title="Void recovery"
        message={`Void the ${formatINR(voiding?.amount)} recovery for ${formatMonth(voiding?.settlementMonth)}? The outstanding balance is restored.`}
        confirmLabel="Void"
        requireReason
        loading={voidRecovery.isPending}
        onConfirm={(reason) => voidRecovery.mutate({ id: voiding.id, reason })}
      />
    </Modal>
  );
}

/** Advances with outstanding balances. `driverId` pins the list to one driver. */
export default function AdvancesTable({ driverId }) {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const { params, update } = useListParams();
  const drivers = useOptions('drivers', { includeInactive: true, enabled: !driverId });
  const query_ = { ...params, ...(driverId && { driverId }) };
  const list = useQuery({
    queryKey: ['advances', 'list', query_],
    queryFn: () => get('/advances', query_),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['advances', 'summary', query_.driverId],
    queryFn: () => get('/advances/summary', query_.driverId ? { driverId: query_.driverId } : {}),
  });
  const s = summary.data;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Advanced" value={formatINR(s?.advanced)} hint={s && `${s.count} advance(s)`} />
        <Stat label="Recovered" value={formatINR(s?.recovered)} tone="positive" />
        <Stat
          label="Outstanding"
          value={formatINR(s?.outstanding)}
          tone="warning"
          hint="Still to be recovered from settlements"
        />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          {!driverId && (
            <FilterSelect
              label="Driver"
              value={params.driverId}
              onChange={(val) => update({ driverId: val })}
              options={(drivers.data ?? []).map(toSelect.drivers)}
            />
          )}
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(val) => update({ status: val })}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'RECOVERED', label: 'Recovered' },
              { value: 'VOID', label: 'Void' },
            ]}
          />
          {can(PERMISSIONS.ADVANCE_MANAGE) && (
            <Button className="sm:ml-auto" icon={Plus} onClick={() => setAdding(true)}>
              Record advance
            </Button>
          )}
        </Toolbar>
        <DataTable
          rows={list.data?.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={setOpen}
          empty={<EmptyState title="No advances" />}
          columns={[
            { key: 'advanceDate', header: 'Date', render: (a) => formatDate(a.advanceDate) },
            ...(driverId
              ? []
              : [
                  {
                    key: 'driver',
                    header: 'Driver',
                    render: (a) => (
                      <Link
                        className="text-brand-700 hover:underline"
                        to={`/drivers/${a.driver.id}?tab=advances`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.driver.fullName}
                      </Link>
                    ),
                  },
                ]),
            { key: 'reason', header: 'Reason', className: 'whitespace-normal max-w-xs' },
            {
              key: 'amount',
              header: 'Advance',
              align: 'right',
              render: (a) => formatINR(a.amount),
            },
            {
              key: 'recoveredAmount',
              header: 'Recovered',
              align: 'right',
              render: (a) => formatINR(a.recoveredAmount),
            },
            {
              key: 'outstandingAmount',
              header: 'Outstanding',
              align: 'right',
              render: (a) => <span className="font-medium">{formatINR(a.outstandingAmount)}</span>,
            },
            {
              key: 'paymentMethod',
              header: 'Paid by',
              render: (a) => paymentMethodLabel(a.paymentMethod),
            },
            { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <NewAdvanceModal open={adding} onClose={() => setAdding(false)} driverId={driverId} />
      <AdvanceDetailModal advance={open} onClose={() => setOpen(null)} />
    </>
  );
}
