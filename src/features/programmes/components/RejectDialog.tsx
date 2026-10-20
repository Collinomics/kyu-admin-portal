import { useState, useEffect } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyTextarea } from '../../../components/ui/KyField';
import type { ProgrammeProfile } from '../types';

interface Props {
  programme: ProgrammeProfile | null;
  loading?: boolean;
  onClose: () => void;
  onReject: (comment: string) => void;
}

export default function RejectDialog({ programme, loading = false, onClose, onReject }: Props) {
  const [comment, setComment] = useState('');
  useEffect(() => { if (programme) setComment(''); }, [programme]);

  if (!programme) return null;

  return (
    <KyModal
      open
      title="Return to coordinator"
      subtitle={programme.name}
      onClose={onClose}
      footer={
        <>
          <KyButton variant="outline" onClick={onClose}>Cancel</KyButton>
          <KyButton variant="danger" loading={loading} disabled={loading || comment.trim().length === 0} onClick={() => onReject(comment.trim())}>Reject & Return</KyButton>
        </>
      }
    >
      <KyTextarea
        label="What should the coordinator fix? *"
        help="This comment becomes part of the permanent review history."
        rows={4}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
    </KyModal>
  );
}
