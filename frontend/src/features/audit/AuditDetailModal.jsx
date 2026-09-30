import { DetailList } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { formatDateTime } from '../../lib/format';
import AuditDiff from './AuditDiff';

export default function AuditDetailModal({ log, onClose }) {
  return (
    <Modal
      open={Boolean(log)}
      onClose={onClose}
      size="lg"
      title={log ? `Audit #${log.id} · ${log.action}` : ''}
    >
      {log && (
        <div className="space-y-4">
          <DetailList
            items={[
              { label: 'When', value: formatDateTime(log.createdAt) },
              {
                label: 'User',
                value: log.user ? `${log.user.name} (${log.user.role.code})` : 'System',
              },
              {
                label: 'Record',
                value: `${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}`,
              },
              { label: 'Reason', value: log.reason },
              { label: 'IP address', value: log.ip },
              { label: 'Request ID', value: log.requestId },
              { label: 'Browser', value: log.userAgent },
            ]}
          />
          <AuditDiff previousValue={log.previousValue} newValue={log.newValue} />
        </div>
      )}
    </Modal>
  );
}
