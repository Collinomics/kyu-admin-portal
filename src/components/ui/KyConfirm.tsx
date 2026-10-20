import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import KyModal from './KyModal';
import KyButton from './KyButton';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  stepUp?: boolean;   // Require password re-entry for highest-impact actions.
  onConfirm: (password?: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function KyConfirm({
  open, title, message, confirmLabel = 'Confirm', tone = 'primary', stepUp, onConfirm, onCancel,
}: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(stepUp ? password : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = !!stepUp && password.trim().length === 0;

  return (
    <KyModal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <KyButton variant="outline" onClick={onCancel}>Cancel</KyButton>
          <KyButton variant={tone === 'danger' ? 'danger' : 'primary'} disabled={blocked} loading={busy} onClick={confirm}>
            {confirmLabel}
          </KyButton>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-kyu-blue/10 text-kyu-blue'}`}>
          {tone === 'danger' ? <AlertTriangle size={20} /> : <ShieldAlert size={20} />}
        </div>
        <p className="text-sm text-gray-600">{message}</p>
      </div>

      {stepUp && (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Re-enter your current password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your current password"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm"
          />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </KyModal>
  );
}
