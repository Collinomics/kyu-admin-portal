import { useEffect, useState } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyInput, KyTextarea } from '../../../components/ui/KyField';
import type { ApplicationCall } from '../types';

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface Props {
  call: ApplicationCall | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (input: { openingDate: string; deadline: string; reason: string }) => void;
}

export default function ReopenCallDialog({ call, loading, onClose, onConfirm }: Props) {
  const [openingDate, setOpeningDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!call) return;
    const today = new Date();
    const future = new Date(); future.setDate(future.getDate() + 30);
    setOpeningDate(isoDate(today));
    setDeadline(call.deadline > isoDate(today) ? call.deadline : isoDate(future));
    setReason('');
  }, [call]);

  const valid = openingDate && deadline > openingDate && reason.trim().length >= 10;
  return <KyModal open={Boolean(call)} title="Reopen application call" subtitle={call ? `${call.programme} · ${call.intake}` : undefined} onClose={onClose} footer={<>
    <KyButton variant="outline" onClick={onClose}>Cancel</KyButton>
    <KyButton loading={loading} disabled={!valid} onClick={() => onConfirm({ openingDate, deadline, reason: reason.trim() })}>Reopen Call</KyButton>
  </>}>
    <p className="mb-4 text-sm leading-6 text-slate-600">Set a new valid application window. The previous closure remains in the audit trail.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <KyInput label="New opening date" type="date" min={isoDate(new Date())} value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} />
      <KyInput label="New deadline" type="date" min={openingDate || isoDate(new Date())} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
    </div>
    <div className="mt-4"><KyTextarea label="Reason for reopening" rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this call is being reopened…" /></div>
  </KyModal>;
}
