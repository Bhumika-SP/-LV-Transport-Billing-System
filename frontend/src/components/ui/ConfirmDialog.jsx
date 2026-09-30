import { useState } from 'react';
import Button from './Button';
import { inputClass } from './Field';
import Modal from './Modal';

/**
 * Confirmation for destructive or significant actions.
 * With `requireReason`, the user must type a reason, which is passed to onConfirm(reason).
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  requireReason = false,
}) {
  const [reason, setReason] = useState('');
  const canConfirm = !requireReason || reason.trim().length >= 3;

  const close = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant}
            loading={loading}
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {requireReason && (
        <div className="mt-4">
          <label htmlFor="confirm-reason" className="mb-1 block text-sm font-medium text-slate-700">
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="confirm-reason"
            rows={3}
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
