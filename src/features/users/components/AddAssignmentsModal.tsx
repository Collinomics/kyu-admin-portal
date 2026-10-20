import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import KyMultiSearchSelect from '../../../components/ui/KyMultiSearchSelect';
import type { AddAssignmentsInput, UserAccount, UserManagementOptions } from '../types';

interface Props { user: UserAccount; options: UserManagementOptions; onClose: () => void; onSave: (input: AddAssignmentsInput) => Promise<void>; }
const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm';

export default function AddAssignmentsModal({ user, options, onClose, onSave }: Props) {
  const coordinator = user.role === 'COORDINATOR';
  const [ids, setIds] = useState<string[]>([]);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState('');
  const [permissions, setPermissions] = useState({ create: true, monitor: true, close: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; }; }, []);
  const available = coordinator
    ? options.programmes.filter((item) => !(user.programmeIds ?? []).includes(item.id)).map((item) => ({ value: item.id, label: `${item.code ? `${item.code} — ` : ''}${item.name}${item.academic_unit ? ` · ${item.academic_unit}` : ''}` }))
    : options.calls.filter((item) => !(user.callIds ?? []).includes(item.id)).map((item) => ({ value: item.id, label: item.name }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!ids.length) return setError('Select at least one new assignment.');
    if (coordinator && (!start || !end || end < start)) return setError('Enter a valid assignment start and end date.');
    setSaving(true);
    try { await onSave(coordinator ? { programmeIds: ids, assignmentStart: start, assignmentEnd: end, priorReview: true } : { callIds: ids, permissions }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The assignments could not be added.'); }
    finally { setSaving(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between bg-kyu-blue px-4 py-4 sm:px-6"><div><h3 className="font-bold text-white">Add assignments</h3><p className="text-xs text-blue-100">{user.firstName} {user.lastName}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white hover:bg-white/10"><X size={19}/></button></div>
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-6">
        <KyMultiSearchSelect label={coordinator ? 'Programmes *' : 'Application calls *'} values={ids} options={available} onChange={setIds} placeholder={available.length ? 'Type to find and add…' : 'No additional assignments available'} />
        {coordinator ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-gray-700">Start date *<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 ${inputClass}`}/></label><label className="text-sm font-semibold text-gray-700">End date *<input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1 ${inputClass}`}/></label></div>
        : <div><p className="mb-2 text-sm font-semibold text-gray-700">Permissions</p><div className="flex flex-wrap gap-4 text-sm">{(['create','monitor','close'] as const).map((key) => <label key={key} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={permissions[key]} onChange={(e) => setPermissions((old) => ({ ...old, [key]: e.target.checked }))}/>{key}</label>)}</div></div>}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold text-gray-600">Cancel</button><button disabled={saving || !available.length} className="rounded-lg bg-kyu-blue px-5 py-2 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add assignments'}</button></div>
      </form>
    </div>
  </div>, document.body);
}
