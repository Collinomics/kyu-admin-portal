import { X, ShieldCheck, KeyRound, UserCheck, UserX, PauseCircle, Trash2, ListPlus } from 'lucide-react';
import type { UserAccount } from '../types';
import { roleLabels, staffStatusLabels } from '../types';
import StatusBadge from './StatusBadge';
import KyButton from '../../../components/ui/KyButton';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  user: UserAccount | null;
  onClose: () => void;
  onReset: () => void;
  onToggle: () => void;
  onSuspend: () => void;
  onDelete: () => void;
  onAssign: () => void;
}

export default function AccountDrawer({ user, onClose, onReset, onToggle, onSuspend, onDelete, onAssign }: Props) {
    useEffect(() => {
        if (!user) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [user]);

  if (!user) return null;

  const rows: Array<[string, string]> = [
    ['Role', roleLabels[user.role]],
    ['Unit', user.unit],
    ['Email', user.email],
    ['Created on', user.createdAt],
  ];
  if (user.department) rows.push(['Department', user.department]);
  if (user.staffStatus) rows.push(['Staff status', staffStatusLabels[user.staffStatus]]);
  if (user.programmes?.length) rows.push(['Programmes', user.programmes.join(' · ')]);
  else if (user.programme) rows.push(['Programme', user.programme]);
  if (user.assignmentStart && user.assignmentEnd) rows.push(['Assignment', `${user.assignmentStart} → ${user.assignmentEnd}`]);
  if (typeof user.assignmentEffective === 'boolean') rows.push(['Assignment access', user.assignmentEffective ? 'Currently effective' : 'Not currently effective']);
  if (typeof user.priorReview === 'boolean') rows.push(['Prior review', user.priorReview ? 'Required' : 'Not required']);
  if (user.calls?.length) rows.push(['Assigned calls', user.calls.join(' · ')]);
  else if (user.call) rows.push(['Assigned call', user.call]);
  if (user.permissions) {
    const perms = (['create', 'monitor', 'close'] as const).filter((p) => user.permissions?.[p]);
    rows.push(['Permissions', perms.length ? perms.join(', ') : 'none']);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-kyu-blue px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/10 text-white font-bold flex items-center justify-center shrink-0">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-white truncate">{user.title} {user.firstName} {user.lastName}</h3>
            <div className="mt-1"><StatusBadge status={user.status} /></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white hover:bg-kyu-blue-dark"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Details */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Account details</h4>
            <dl className="space-y-2.5">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-500 shrink-0">{k}</dt>
                  <dd className="text-gray-800 font-semibold text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Delegation lineage */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Delegation lineage</h4>
            <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600 flex items-center gap-2">
              <ShieldCheck size={16} className="text-kyu-blue shrink-0" />
              <span>Created by <span className="font-semibold text-gray-800">{user.createdBy}</span></span>
            </div>
          </section>

          {/* Lifecycle timeline */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Lifecycle</h4>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-kyu-blue mt-1.5 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800">Account created</p>
                  <p className="text-xs text-gray-400">{user.createdAt} · verification email + OTP sent</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${user.status === 'pending' ? 'bg-gray-300' : 'bg-green-500'}`} />
                <div>
                  <p className="font-semibold text-gray-800">{user.status === 'pending' ? 'Awaiting verification' : 'Verified & active'}</p>
                  <p className="text-xs text-gray-400">{user.status === 'pending' ? 'User must complete OTP onboarding' : 'Password set on first login'}</p>
                </div>
              </li>
              {user.status === 'locked' && (
                <li className="flex gap-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-800">Locked</p>
                    <p className="text-xs text-gray-400">Five failed login attempts — password reset or admin unlock required</p>
                  </div>
                </li>
              )}
              {user.status === 'inactive' && (
                <li className="flex gap-3">
                  <span className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-800">Deactivated</p>
                    <p className="text-xs text-gray-400">Login blocked; audit history preserved</p>
                  </div>
                </li>
              )}
              {user.status === 'suspended' && (
                <li className="flex gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div><p className="font-semibold text-gray-800">Suspended</p><p className="text-xs text-gray-400">Access and active sessions are temporarily blocked</p></div>
                </li>
              )}
            </ol>
            </section>
        </div>

        {/* Quick actions */}
        <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2">
          {user.status === 'active' && ['COORDINATOR', 'ADMISSIONS_OFFICER'].includes(user.role) && <KyButton variant="outline" className="w-full" icon={<ListPlus size={16} />} onClick={onAssign}>Add {user.role === 'COORDINATOR' ? 'programme' : 'call'} assignments</KyButton>}
          <KyButton variant="outline" className="flex-1" icon={<KeyRound size={16} />} onClick={onReset}>
            Reset Password
          </KyButton>
          {['inactive', 'suspended', 'locked'].includes(user.status) ? (
            <KyButton className="flex-1" icon={<UserCheck size={16} />} onClick={onToggle}>
              Reactivate
            </KyButton>
          ) : user.status !== 'pending' ? (
            <><KyButton variant="outline" className="flex-1" icon={<PauseCircle size={16} />} onClick={onSuspend}>Suspend</KyButton><KyButton variant="danger" className="flex-1" icon={<UserX size={16} />} onClick={onToggle}>Deactivate</KyButton></>
          ) : null}
          {user.canDelete && <KyButton variant="danger" className="w-full" icon={<Trash2 size={16} />} onClick={onDelete}>Remove unused account</KyButton>}
        </div>
      </aside>
    </div>,
    document.body
  );
}
