import { useState, useEffect } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyTextarea } from '../../../components/ui/KyField';
import type { ApplicationCall } from '../types';

interface Props {
  call: ApplicationCall | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export default function CloseCallDialog({ call, onClose, onConfirm, loading = false }: Props) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (call) setReason(''); }, [call]);

  if (!call) return null;

  return (
    <KyModal
      open
      title="Close this call early?"
      subtitle={`${call.programme} — ${call.intake}`}
      onClose={onClose}
      footer={
        <>
          <KyButton variant="outline" disabled={loading} onClick={onClose}>Cancel</KyButton>
          <KyButton variant="danger" loading={loading} disabled={reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
            Close Call
          </KyButton>
        </>
      }
    >
      <KyTextarea
        label="Reason for early closure (mandatory — recorded in the audit log)"
        help="Applicants and officers will see this reason."
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </KyModal>
  );
}
