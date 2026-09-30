import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Info, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../../auth/auth-context';
import EntityFormModal from '../../components/EntityFormModal';
import PageHeader from '../../components/PageHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import Stat from '../../components/ui/Stat';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import Tabs from '../../components/ui/Tabs';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { get, patch, post } from '../../lib/api';
import { currentMonth, formatDate, formatINR, formatMonth, today } from '../../lib/format';
import { v } from '../../lib/forms';
import ReportsPage from '../reports/ReportsPage';
import GstRecordForm from './GstRecordForm';
import { DocumentsButton } from '../documents/DocumentsPanel';

export function Disclaimer() {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      GST reporting and return preparation only. Nothing here is filed with the GST portal; figures
      must be reviewed by your tax professional before filing.
    </p>
  );
}

function Overview() {
  const [period, setPeriod] = useState(currentMonth());
  const summary = useQuery({
    queryKey: ['gst', 'summary', period],
    queryFn: () => get('/gst/summary', { taxPeriod: period }),
    placeholderData: keepPreviousData,
  });
  const g3b = useQuery({
    queryKey: ['gst', 'gstr3b', period],
    queryFn: () => get('/gst/gstr3b', { taxPeriod: period }),
    placeholderData: keepPreviousData,
  });
  if (summary.isLoading) return <LoadingState />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.refetch} />;
  const s = summary.data;
  const rows = g3b.data
    ? Object.entries(g3b.data)
        .filter(([k]) => k !== 'netTaxPayable')
        .map(([k, x]) => ({ id: k, table: k, ...x }))
    : [];
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        Tax period
        <input
          type="month"
          className={`${inputClass} w-44`}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </label>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Outward taxable value"
          value={formatINR(s.outward.taxableValue)}
          hint={`${s.outward.count} invoice(s)`}
        />
        <Stat
          label="Output tax"
          value={formatINR(s.outward.totalTax)}
          hint={`CGST ${formatINR(s.outward.cgst)} · SGST ${formatINR(s.outward.sgst)} · IGST ${formatINR(s.outward.igst)}`}
        />
        <Stat
          label="Input tax credit (inward)"
          value={formatINR(s.inward.totalTax)}
          hint={`Reverse charge tax ${formatINR(s.reverseCharge.totalTax)}`}
          tone="positive"
        />
        <Stat
          label="Indicative net tax payable"
          value={formatINR(s.netTaxPayable)}
          tone="warning"
        />
      </div>
      <Card title={`GSTR-3B supporting figures · ${formatMonth(period)}`}>
        <DataTable
          rows={rows}
          empty={<EmptyState title="No records" />}
          columns={[
            { key: 'table', header: 'Table', className: 'whitespace-normal' },
            {
              key: 'taxableValue',
              header: 'Taxable value',
              align: 'right',
              render: (r) => formatINR(r.taxableValue),
            },
            { key: 'igst', header: 'IGST', align: 'right', render: (r) => formatINR(r.igst) },
            { key: 'cgst', header: 'CGST', align: 'right', render: (r) => formatINR(r.cgst) },
            { key: 'sgst', header: 'SGST', align: 'right', render: (r) => formatINR(r.sgst) },
            { key: 'cess', header: 'Cess', align: 'right', render: (r) => formatINR(r.cess) },
          ]}
        />
      </Card>
    </>
  );
}

function Records() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const { params, update } = useListParams();
  const list = useQuery({
    queryKey: ['gst', 'records', params],
    queryFn: () => get('/gst/records', params),
    placeholderData: keepPreviousData,
  });
  const voidRecord = useMutation({
    mutationFn: ({ id, reason }) => post(`/gst/records/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Record voided');
      queryClient.invalidateQueries({ queryKey: ['gst'] });
      setVoiding(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const columns = [
    { key: 'invoiceDate', header: 'Date', render: (r) => formatDate(r.invoiceDate) },
    { key: 'invoiceNumber', header: 'Invoice' },
    {
      key: 'direction',
      header: 'Direction',
      render: (r) => (r.direction === 'OUTWARD' ? 'Outward' : 'Inward'),
    },
    { key: 'counterpartyName', header: 'Party' },
    { key: 'counterpartyGstin', header: 'GSTIN' },
    { key: 'hsnSac', header: 'HSN/SAC' },
    {
      key: 'taxableValue',
      header: 'Taxable',
      align: 'right',
      render: (r) => formatINR(r.taxableValue),
    },
    { key: 'totalTax', header: 'Tax', align: 'right', render: (r) => formatINR(r.totalTax) },
    {
      key: 'invoiceValue',
      header: 'Invoice value',
      align: 'right',
      render: (r) => formatINR(r.invoiceValue),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status === 'VOID' ? 'CANCELLED' : 'ACTIVE'} />,
    },
  ];
  columns.push({
    key: 'documents',
    header: <span className="sr-only">Documents</span>,
    align: 'right',
    render: (r) => (
      <DocumentsButton
        entityType="GST_RECORD"
        entityId={r.id}
        title={`Documents · ${r.invoiceNumber}`}
        canManage={can(PERMISSIONS.GST_MANAGE)}
      />
    ),
  });
  if (can(PERMISSIONS.GST_MANAGE)) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) =>
        r.status === 'ACTIVE' && (
          <Button
            size="sm"
            variant="ghost"
            icon={Ban}
            onClick={() => setVoiding(r)}
            aria-label="Void"
          />
        ),
    });
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Toolbar>
        <SearchInput
          value={params.search}
          onChange={(search) => update({ search })}
          placeholder="Invoice, party, GSTIN"
        />
        <input
          type="month"
          aria-label="Tax period"
          className={`${inputClass} w-full sm:w-44`}
          value={params.taxPeriod ?? ''}
          onChange={(e) => update({ taxPeriod: e.target.value || undefined })}
        />
        <FilterSelect
          label="Direction"
          value={params.direction}
          onChange={(val) => update({ direction: val })}
          options={[
            { value: 'OUTWARD', label: 'Outward' },
            { value: 'INWARD', label: 'Inward' },
          ]}
        />
        {can(PERMISSIONS.GST_MANAGE) && (
          <Button className="sm:ml-auto" icon={Plus} onClick={() => setAdding(true)}>
            New record
          </Button>
        )}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        empty={<EmptyState title="No GST records" />}
      />
      <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      <GstRecordForm open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title="Void GST record"
        message={`Void invoice ${voiding?.invoiceNumber}? It stays in history but is excluded from all GST reports.`}
        confirmLabel="Void"
        requireReason
        loading={voidRecord.isPending}
        onConfirm={(reason) => voidRecord.mutate({ id: voiding.id, reason })}
      />
    </div>
  );
}

function TaxRates() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(undefined);
  const { data, isLoading, error } = useQuery({
    queryKey: ['gst', 'tax-rates', 'all'],
    queryFn: () => get('/gst/tax-rates', { includeInactive: 'true' }),
  });
  const initialValues = useMemo(
    () =>
      editing
        ? {
            hsnSac: editing.hsnSac,
            description: editing.description,
            gstRate: editing.gstRate,
            cessRate: editing.cessRate,
            effectiveFrom: editing.effectiveFrom,
            effectiveTo: editing.effectiveTo ?? '',
          }
        : {
            hsnSac: '',
            description: '',
            gstRate: '',
            cessRate: '0',
            effectiveFrom: today(),
            effectiveTo: '',
          },
    [editing],
  );
  return (
    <Card
      title="Tax rate configuration"
      actions={
        can(PERMISSIONS.TAX_CONFIG_MANAGE) && (
          <Button size="sm" icon={Plus} onClick={() => setEditing(null)}>
            Add rate
          </Button>
        )
      }
    >
      <DataTable
        rows={data}
        loading={isLoading}
        error={error}
        onRowClick={can(PERMISSIONS.TAX_CONFIG_MANAGE) ? setEditing : undefined}
        empty={
          <EmptyState
            title="No rates configured"
            description="Admins add HSN/SAC rates; nothing is hard-coded."
          />
        }
        columns={[
          { key: 'hsnSac', header: 'HSN/SAC' },
          { key: 'description', header: 'Description', className: 'whitespace-normal' },
          { key: 'gstRate', header: 'GST %', align: 'right' },
          { key: 'cessRate', header: 'Cess %', align: 'right' },
          { key: 'effectiveFrom', header: 'From', render: (r) => formatDate(r.effectiveFrom) },
          {
            key: 'effectiveTo',
            header: 'To',
            render: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : 'Open'),
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      <EntityFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        size="md"
        title={editing ? `Edit rate ${editing.hsnSac}` : 'Add tax rate'}
        fields={[
          { name: 'hsnSac', label: 'HSN/SAC', required: true },
          { name: 'description', label: 'Description', required: true },
          { name: 'gstRate', label: 'GST rate %', required: true, inputMode: 'decimal' },
          { name: 'cessRate', label: 'Cess rate %', inputMode: 'decimal' },
          { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
          { name: 'effectiveTo', label: 'Effective to', type: 'date' },
        ]}
        schema={z.object({
          hsnSac: v
            .optionalMatch(/^\d{4,8}$/, 'HSN/SAC must be 4–8 digits')
            .refine(Boolean, 'Required'),
          description: v.required('Description'),
          gstRate: v.amount('Rate').refine((s) => Number(s) <= 100, 'At most 100%'),
          cessRate: v.amount('Cess'),
          effectiveFrom: v.required('Effective from'),
          effectiveTo: v.optional(),
        })}
        initialValues={initialValues}
        onSubmit={(vals) =>
          editing ? patch(`/gst/tax-rates/${editing.id}`, vals) : post('/gst/tax-rates', vals)
        }
        successMessage="Tax rate saved"
        invalidateKeys={[['gst']]}
      />
    </Card>
  );
}

export default function GstPage() {
  return (
    <>
      <PageHeader
        title="GST"
        description="Tax invoice register, purchase records, rates and return-preparation figures"
      />
      <Disclaimer />
      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview', content: <Overview /> },
          { key: 'records', label: 'Invoices & purchases', content: <Records /> },
          { key: 'rates', label: 'Tax rates', content: <TaxRates /> },
        ]}
      />
    </>
  );
}

export function TaxReportsPage() {
  return (
    <>
      <Disclaimer />
      <ReportsPage
        title="Tax Reports"
        description="GSTR-1 / GSTR-3B supporting registers, HSN/SAC summary and tax reconciliation"
        reportKeys={[
          'gst-invoice-register',
          'gst-gstr1-b2b',
          'gst-purchase-register',
          'gst-hsn-summary',
          'gst-reconciliation',
        ]}
      />
    </>
  );
}
