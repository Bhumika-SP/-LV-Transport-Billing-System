import { useMemo } from 'react';
import { z } from 'zod';
import EntityFormModal from '../../components/EntityFormModal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { patch, post } from '../../lib/api';
import { formatDate, today } from '../../lib/format';
import { v } from '../../lib/forms';
import { KINDS } from './kinds';

const dateSchema = {
  startDate: v.required('Start date'),
  endDate: v.optional(),
  notes: v.optional(),
};
const endAfterStart = (d) => !d.endDate || d.endDate >= d.startDate;
const endAfterStartMessage = {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
};

/**
 * Create an assignment (assignment = null) or edit/end an existing one.
 * The two parties are fixed once created; only dates and notes change.
 */
export default function AssignmentFormModal({ open, onClose, kind, assignment }) {
  const k = KINDS[kind];
  const isEdit = Boolean(assignment);
  const optionsA = useOptions(k.parties[0].resource, { enabled: open && !isEdit });
  const optionsB = useOptions(k.parties[1].resource, { enabled: open && !isEdit });

  const schema = useMemo(
    () =>
      z
        .object({
          ...(isEdit
            ? {}
            : Object.fromEntries(k.parties.map((p) => [p.field, v.required(p.label)]))),
          ...dateSchema,
        })
        .refine(endAfterStart, endAfterStartMessage),
    [isEdit, k],
  );

  const initialValues = useMemo(
    () =>
      isEdit
        ? {
            startDate: assignment.startDate,
            endDate: assignment.endDate ?? '',
            notes: assignment.notes ?? '',
          }
        : {
            [k.parties[0].field]: '',
            [k.parties[1].field]: '',
            startDate: today(),
            endDate: '',
            notes: '',
          },
    [isEdit, assignment, k],
  );

  const partyFields = isEdit
    ? []
    : k.parties.map((p, i) => ({
        name: p.field,
        label: p.label,
        type: 'select',
        required: true,
        placeholder: `Select ${p.label.toLowerCase()}`,
        options: ((i === 0 ? optionsA : optionsB).data ?? []).map(toSelect[p.resource]),
      }));

  const fields = [
    ...partyFields,
    { name: 'startDate', label: 'Start date', type: 'date', required: true },
    { name: 'endDate', label: 'End date', type: 'date', hint: 'Leave blank if ongoing' },
    { name: 'notes', label: 'Notes', full: true },
  ];

  const title = isEdit
    ? `Edit assignment — ${k.describe(assignment)} (from ${formatDate(assignment.startDate)})`
    : `New ${k.title.toLowerCase()} assignment`;

  return (
    <EntityFormModal
      open={open && (isEdit || (!optionsA.isLoading && !optionsB.isLoading))}
      onClose={onClose}
      size="md"
      title={title}
      fields={fields}
      schema={schema}
      initialValues={initialValues}
      onSubmit={(values) =>
        isEdit
          ? patch(`/assignments/${k.path}/${assignment.id}`, values)
          : post(`/assignments/${k.path}`, values)
      }
      submitLabel={isEdit ? 'Save' : 'Create assignment'}
      successMessage={isEdit ? 'Assignment updated' : 'Assignment created'}
      invalidateKeys={[['assignments'], ['vehicles'], ['drivers'], ['companies']]}
    />
  );
}
