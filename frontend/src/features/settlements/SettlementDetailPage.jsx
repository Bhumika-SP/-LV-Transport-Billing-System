import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  RotateCcw,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import DetailHeader from '../../components/DetailHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { DetailList } from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { get, post } from '../../lib/api';
import { formatDate, formatDateTime, formatINR, formatMonth } from '../../lib/format';

/** Component key → the settlement item component codes it aggregates. */
const COMPONENT_CODES = {
  tripEarnings: 'TRIP_EARNINGS',
  allowances: 'ALLOWANCE',
  otherEarnings: 'OTHER_EARNING',
  positiveAdjustments: 'POSITIVE_ADJUSTMENT',
  reimbursements: 'REIMBURSEMENT',
  fuel: 'FUEL',
  toll: 'TOLL',
  maintenance: 'MAINTENANCE',
  emi: 'EMI',
  advanceRecovery: 'ADVANCE_RECOVERY',
  otherDeductions: 'OTHER_DEDUCTION',
};

function ComponentRow({ component, items }) {
  const [open, setOpen] = useState(false);
  const sign = component.direction === 'DEDUCT' ? '−' : '+';
  const zero = component.amount === '0.00';
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-4 py-2">
          <button
            type="button"
            disabled={!items.length}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-left text-slate-700 disabled:text-slate-500"
          >
            {items.length ? (
              open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="w-4" />
            )}
            {component.label}
            {items.length > 0 && <span className="text-xs text-slate-400">({items.length})</span>}
          </button>
        </td>
        <td
          className={`px-4 py-2 text-right tabular-nums ${zero ? 'text-slate-400' : component.direction === 'DEDUCT' ? 'text-red-700' : ''}`}
        >
          {zero ? formatINR('0') : `${sign}${formatINR(component.amount)}`}
        </td>
      </tr>
      {open &&
        items.map((i) => (
          <tr key={i.id} className="bg-slate-50/70 text-xs">
            <td className="py-1.5 pr-4 pl-11 text-slate-600">
              {formatDate(i.sourceDate)} · {i.description}
            </td>
            <td className="px-4 py-1.5 text-right text-slate-600 tabular-nums">
              {formatINR(i.amount)}
            </td>
          </tr>
        ))}
    </>
  );
}

/** The transparent calculation, laid out as in spec §49. */
function Calculation({ s }) {
  const itemsFor = (key) => s.items.filter((i) => i.component === COMPONENT_CODES[key]);
  const additions = s.components.filter((c) => c.direction === 'ADD');
  const deductions = s.components.filter((c) => c.direction === 'DEDUCT');
  return (
    <Card title="Settlement calculation">
      <table className="w-full text-sm">
        <tbody>
          {additions.map((c) => (
            <ComponentRow key={c.key} component={c} items={itemsFor(c.key)} />
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-2 font-medium text-slate-700">
              Subtotal{' '}
              <span className="text-xs font-normal text-slate-500">
                (gross earnings {formatINR(s.grossEarnings)} + reimbursements)
              </span>
            </td>
            <td className="px-4 py-2 text-right font-medium tabular-nums">
              {formatINR(s.totalAdditions)}
            </td>
          </tr>
          {deductions.map((c) => (
            <ComponentRow key={c.key} component={c} items={itemsFor(c.key)} />
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td className="px-4 py-2 font-medium text-slate-700">Total deductions</td>
            <td className="px-4 py-2 text-right font-medium text-red-700 tabular-nums">
              −{formatINR(s.totalDeductions)}
            </td>
          </tr>
          <tr className="border-t-2 border-slate-300">
            <td className="px-4 py-3 text-base font-semibold text-slate-900">
              Final driver settlement
            </td>
            <td
              className={`px-4 py-3 text-right text-lg font-bold tabular-nums ${s.finalAmount.startsWith('-') ? 'text-red-700' : 'text-slate-900'}`}
            >
              {formatINR(s.finalAmount)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Calculated by the server from {s.itemCount} source entries
        {s.calculatedAt &&
          ` on ${formatDateTime(s.calculatedAt)} by ${s.calculatedBy?.name ?? '—'}`}
        . Expand a line to see its entries.
      </p>
    </Card>
  );
}

function Workflow({ s }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null); // { action, title, message, reason?, variant }

  const run = useMutation({
    mutationFn: ({ action, reason }) =>
      post(`/settlements/${s.id}/${action}`, reason ? { reason } : {}),
    onSuccess: (r, { done }) => {
      toast.success(done);
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      setDialog(null);
    },
    onError: (err) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ['settlements', s.id] });
      setDialog(null);
    },
  });

  const act = (action, done) => run.mutate({ action, done });
  const prepare = can(PERMISSIONS.SETTLEMENT_PREPARE);
  const buttons = [];
  if (prepare && ['DRAFT', 'CALCULATED'].includes(s.status)) {
    buttons.push(
      <Button
        key="calc"
        variant="secondary"
        icon={Calculator}
        loading={run.isPending}
        onClick={() => act('calculate', 'Recalculated')}
      >
        {s.status === 'DRAFT' ? 'Calculate' : 'Recalculate'}
      </Button>,
    );
  }
  if (prepare && s.status === 'CALCULATED') {
    buttons.push(
      <Button
        key="submit"
        icon={Send}
        onClick={() =>
          setDialog({
            action: 'submit',
            done: 'Submitted for review',
            title: 'Submit for review',
            message: `Submit ${formatINR(s.finalAmount)} for Admin/Manager approval? The driver's data for this month is locked while under review.`,
            variant: 'primary',
          })
        }
      >
        Submit for review
      </Button>,
    );
  }
  if (prepare && s.status === 'UNDER_REVIEW') {
    buttons.push(
      <Button
        key="withdraw"
        variant="secondary"
        icon={Undo2}
        onClick={() => act('withdraw', 'Returned to draft')}
      >
        Withdraw
      </Button>,
    );
  }
  if (can(PERMISSIONS.SETTLEMENT_APPROVE) && ['UNDER_REVIEW', 'APPROVED'].includes(s.status)) {
    buttons.push(
      <Button
        key="reject"
        variant="secondary"
        icon={XCircle}
        onClick={() =>
          setDialog({
            action: 'reject',
            done: 'Rejected to draft',
            title: 'Reject settlement',
            message: 'Send the settlement back to draft for correction.',
            reason: true,
          })
        }
      >
        Reject
      </Button>,
    );
  }
  if (can(PERMISSIONS.SETTLEMENT_APPROVE) && s.status === 'UNDER_REVIEW') {
    buttons.push(
      <Button
        key="approve"
        icon={CheckCircle2}
        onClick={() =>
          setDialog({
            action: 'approve',
            done: 'Approved',
            title: 'Approve settlement',
            message: `Approve ${s.driver.fullName}'s ${formatMonth(s.settlementMonth)} settlement of ${formatINR(s.finalAmount)}?`,
            variant: 'primary',
          })
        }
      >
        Approve
      </Button>,
    );
  }
  if (can(PERMISSIONS.SETTLEMENT_FINALIZE) && s.status === 'APPROVED') {
    buttons.push(
      <Button
        key="finalize"
        icon={Lock}
        onClick={() =>
          setDialog({
            action: 'finalize',
            done: 'Finalized',
            title: 'Finalize settlement',
            message: `Finalize ${formatINR(s.finalAmount)}? It becomes payable, counts toward LV profit, and can only be changed by reopening.`,
            variant: 'primary',
          })
        }
      >
        Finalize
      </Button>,
    );
  }
  if (can(PERMISSIONS.SETTLEMENT_REOPEN) && s.status === 'FINALIZED') {
    buttons.push(
      <Button
        key="reopen"
        variant="secondary"
        icon={RotateCcw}
        onClick={() =>
          setDialog({
            action: 'reopen',
            done: 'Reopened as draft',
            title: 'Reopen finalized settlement',
            message:
              'The finalized state is preserved as a revision. The settlement returns to draft and must be recalculated, re-approved and re-finalized.',
            reason: true,
          })
        }
      >
        Reopen
      </Button>,
    );
  }

  return (
    <>
      {buttons}
      <ConfirmDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.title}
        message={dialog?.message}
        confirmLabel={dialog?.title?.split(' ')[0]}
        variant={dialog?.variant ?? 'danger'}
        requireReason={dialog?.reason}
        loading={run.isPending}
        onConfirm={(reason) =>
          run.mutate({
            action: dialog.action,
            done: dialog.done,
            reason: dialog.reason ? reason : undefined,
          })
        }
      />
    </>
  );
}

export default function SettlementDetailPage() {
  const id = Number(useParams().id);
  const {
    data: s,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['settlements', id],
    queryFn: () => get(`/settlements/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <DetailHeader
        backTo="/settlements"
        backLabel="Driver settlements"
        title={`${s.driver.fullName} · ${formatMonth(s.settlementMonth)}`}
        status={s.status}
        subtitle={`${s.driver.driverCode} · version ${s.version}${s.reopenCount ? ` · reopened ${s.reopenCount}×` : ''}`}
        actions={<Workflow s={s} />}
      />

      {s.isStale && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The driver's data for this month changed after this settlement was calculated. Recalculate
          before submitting.
        </div>
      )}
      {s.status === 'DRAFT' && !s.calculatedAt && (
        <p className="mb-4 text-sm text-slate-600">Not calculated yet.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Calculation s={s} />
        </div>
        <div className="space-y-4">
          <Card title="Payment">
            <DetailList
              items={[
                {
                  label: 'Final settlement',
                  value: <span className="font-semibold">{formatINR(s.finalAmount)}</span>,
                },
                { label: 'Paid', value: formatINR(s.paidAmount) },
                {
                  label: 'Outstanding',
                  value:
                    s.outstandingAmount === null
                      ? 'Payable once finalized'
                      : formatINR(s.outstandingAmount),
                },
                {
                  label: 'Status',
                  value: s.paymentStatus ? <StatusBadge status={s.paymentStatus} /> : '—',
                },
              ]}
            />
          </Card>
          <Card title="Workflow">
            <DetailList
              items={[
                {
                  label: 'Driver',
                  value: (
                    <Link
                      className="text-brand-700 hover:underline"
                      to={`/drivers/${s.driver.id}?tab=settlements`}
                    >
                      {s.driver.fullName}
                    </Link>
                  ),
                },
                {
                  label: 'Calculated',
                  value:
                    s.calculatedAt &&
                    `${formatDateTime(s.calculatedAt)} · ${s.calculatedBy?.name ?? ''}`,
                },
                {
                  label: 'Submitted',
                  value:
                    s.submittedAt &&
                    `${formatDateTime(s.submittedAt)} · ${s.submittedBy?.name ?? ''}`,
                },
                {
                  label: 'Approved',
                  value:
                    s.approvedAt && `${formatDateTime(s.approvedAt)} · ${s.approvedBy?.name ?? ''}`,
                },
                {
                  label: 'Finalized',
                  value:
                    s.finalizedAt &&
                    `${formatDateTime(s.finalizedAt)} · ${s.finalizedBy?.name ?? ''}`,
                },
              ]}
            />
          </Card>
          {s.revisions.length > 0 && (
            <Card title="Reopen history">
              <ul className="divide-y divide-slate-100 text-sm">
                {s.revisions.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      Version {r.version}: {formatINR(r.snapshot.settlement.finalAmount)} finalized
                    </div>
                    <div className="text-slate-600">
                      Reopened {formatDateTime(r.createdAt)} by {r.reopenedBy?.name ?? '—'}
                    </div>
                    <div className="mt-1 text-slate-500">Reason: {r.reason}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
