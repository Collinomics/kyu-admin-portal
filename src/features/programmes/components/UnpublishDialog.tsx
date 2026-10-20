import { useEffect, useState } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import type { ProgrammeProfile } from '../types';

interface Props {
  programme: ProgrammeProfile | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function UnpublishDialog({ programme, loading, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (programme) setReason(''); }, [programme]);

  return <KyModal open={Boolean(programme)} title="Unpublish programme" subtitle={programme?.name} onClose={onClose} footer={<>
    <KyButton variant="outline" onClick={onClose}>Cancel</KyButton>
    <KyButton variant="danger" loading={loading} disabled={reason.trim().length < 10} onClick={() => onConfirm(reason.trim())}>Unpublish</KyButton>
  </>}>
    <p className="text-sm leading-6 text-slate-600">This immediately removes the programme from the public catalogue and queues removal from AI results. Internal versions and review history are retained. Close any open application calls first.</p>
    <label className="mt-4 block text-sm font-semibold text-slate-700">Reason *</label>
    <textarea rows={4} maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this programme must be unpublished…" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-kyu-blue" />
  </KyModal>;
}
