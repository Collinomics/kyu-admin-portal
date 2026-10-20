import { useState, useEffect } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyTextarea } from '../../../components/ui/KyField';
import type { ProgrammeProfile } from '../types';

interface Props {
  programme: ProgrammeProfile | null;
  loading?: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
}

export default function RecommendDialog({ programme, loading = false, onClose, onSend }: Props) {
  const [text, setText] = useState('');
  useEffect(() => { if (programme) setText(''); }, [programme]);

  if (!programme) return null;

  return (
    <KyModal
      open
      title="Recommend changes"
      subtitle={`${programme.name} — advisory note recorded in the permanent review history`}
      onClose={onClose}
      footer={
        <>
          <KyButton variant="outline" onClick={onClose}>Cancel</KyButton>
          <KyButton loading={loading} disabled={loading || text.trim().length === 0} onClick={() => onSend(text.trim())}>Send Recommendation</KyButton>
        </>
      }
    >
      <KyTextarea
        label="What would you like changed?"
        help="This is a non-blocking advisory note. The programme remains with the Dean for a final publish or return decision."
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </KyModal>
  );
}
