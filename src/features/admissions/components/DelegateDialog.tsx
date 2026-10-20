import { useState, useEffect } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import type { ApplicationCall } from '../types';
import type { OfficerPermissions } from '../../users/types';
import type { AdmissionsOptions } from '../admissionsService';
import { CheckCircle2, Search, UserPlus } from 'lucide-react';

interface Props {
  call: ApplicationCall | null;
  officers: AdmissionsOptions['officers'];
  onClose: () => void;
  onSave: (officerId: string, officerName: string, perms: OfficerPermissions) => Promise<void>;
  acting?: string | null;
}

export default function DelegateDialog({ call, officers, onClose, onSave, acting = null }: Props) {
  const [perms, setPerms] = useState<Record<string, OfficerPermissions>>({});
  const [query, setQuery] = useState('');
  useEffect(() => { if (call) { setPerms({}); setQuery(''); } }, [call]);

  if (!call) return null;
  const needle = query.trim().toLowerCase();
  const visibleOfficers = officers
    .filter((officer) => `${officer.title ?? ''} ${officer.first_name} ${officer.last_name} ${officer.email}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aAssigned = call.assignments.some((assignment) => assignment.officerId === a.id);
      const bAssigned = call.assignments.some((assignment) => assignment.officerId === b.id);
      if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  const assigned = visibleOfficers.filter((officer) => call.assignments.some((assignment) => assignment.officerId === officer.id));
  const available = visibleOfficers.filter((officer) => !call.assignments.some((assignment) => assignment.officerId === officer.id));

  const officerCard = (o: AdmissionsOptions['officers'][number], isAssigned: boolean) => {
    const existing = call.assignments.find((assignment) => assignment.officerId === o.id)?.permissions;
    const p = perms[o.id] ?? existing ?? { create: false, monitor: true, close: false };
    const changed = Boolean(perms[o.id]);
    const set = (patch: Partial<OfficerPermissions>) => setPerms((prev) => ({ ...prev, [o.id]: { ...p, ...patch } }));
    return <div key={o.id} className={`rounded-xl border p-3 sm:p-4 ${isAssigned ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex min-w-0 items-start gap-2">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isAssigned ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-kyu-blue'}`}>{isAssigned ? <CheckCircle2 size={17}/> : <UserPlus size={16}/>}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-800">{o.title} {o.first_name} {o.last_name}</p><p className="truncate text-xs text-gray-500">{o.email}</p></div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${isAssigned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{isAssigned ? 'Assigned' : 'Available'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
        {(['create', 'monitor', 'close'] as const).map((permission) => <label key={permission} className="flex cursor-pointer items-center gap-1.5 capitalize"><input type="checkbox" className="h-4 w-4 accent-kyu-blue" checked={p[permission]} onChange={(e) => set({ [permission]: e.target.checked })}/>{permission}</label>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2"><p className="text-[11px] text-gray-400">Close permission remains off unless explicitly selected.</p><KyButton size="sm" variant={isAssigned ? 'outline' : 'primary'} loading={acting === `delegate:${call.id}:${o.id}`} disabled={acting !== null || (isAssigned && !changed)} onClick={() => void onSave(o.id, `${o.title ?? ''} ${o.first_name} ${o.last_name}`.trim(), p)}>{isAssigned ? 'Update' : 'Assign'}</KyButton></div>
    </div>;
  };

  return (
    <KyModal
      open
      title="Delegate this call"
      subtitle={`${call.programme} — assign scoped permissions per officer`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs"><div><strong className="block text-lg text-green-700">{call.assignments.length}</strong><span className="text-gray-500">Assigned officers</span></div><div className="border-l border-slate-200"><strong className="block text-lg text-kyu-blue">{Math.max(0, officers.length - call.assignments.length)}</strong><span className="text-gray-500">Available officers</span></div></div>
        {officers.length > 0 && <label className="relative block">
          <span className="sr-only">Search admissions officers</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name or email to find an officer…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-kyu-blue" />
        </label>}
        {officers.length === 0 && (
          <p className="text-sm text-gray-500">No Admissions Officers exist yet — create them in User Management.</p>
        )}
        {officers.length > 0 && visibleOfficers.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No officer matches that search.</p>}
        {assigned.length > 0 && <section><h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-700">Currently assigned</h4><div className="space-y-2">{assigned.map((officer) => officerCard(officer, true))}</div></section>}
        {available.length > 0 && <section><h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Available to assign</h4><div className="space-y-2">{available.map((officer) => officerCard(officer, false))}</div></section>}
      </div>
    </KyModal>
  );
}
