import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, GraduationCap, Briefcase, Building2, PenLine, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../types';
import type { CreateUserInput, UserAccount, UserManagementOptions, UserRole } from '../types';
import { creatableRoles } from '../delegation';
import DynamicRoleFields from './DynamicRoleFields';

interface Props {
  onClose: () => void;
  onCreate: (input: CreateUserInput) => Promise<void>;
  options: UserManagementOptions;
}

const roleIcons: Record<UserRole, LucideIcon> = {
  SYSADMIN: Building2, DEAN: GraduationCap, REGISTRAR: Briefcase,
  HOD: Building2, COORDINATOR: PenLine, ADMISSIONS_OFFICER: ClipboardList,
};

type Extra = Partial<UserAccount>;

const defaultsFor = (r: UserRole): Extra =>
  r === 'ADMISSIONS_OFFICER'
    ? { staffStatus: 'permanent', permissions: { create: true, monitor: true, close: false } }
    : r === 'COORDINATOR'
      ? { staffStatus: 'permanent', priorReview: true }
      : {};

export default function CreateAccountModal({ onClose, onCreate, options: lookupOptions }: Props) {
  const { user } = useAuth();
  const creator: UserRole = user?.role ?? 'SYSADMIN';
  const options = creatableRoles[creator];

  const [role, setRole] = useState<UserRole>(options[0]);
  const [title, setTitle] = useState('Dr.');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [extra, setExtra] = useState<Extra>(defaultsFor(options[0]));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const patch = (p: Extra) => setExtra((prev) => ({ ...prev, ...p }));

  const pickRole = (r: UserRole) => { setRole(r); setExtra(defaultsFor(r)); setError(''); };

  const validate = (): string => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return 'Please fill in title, names and email.';
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.';
    if (role === 'DEAN' && !extra.facultyId) return 'Please choose the faculty or school this Dean will head.';
    if (role === 'HOD' && (!extra.facultyId || !extra.departmentId)) return 'Please choose both the faculty and the department this HOD will head.';
    if (role === 'COORDINATOR' && (!(extra.programmeIds?.length || extra.programmeId) || !extra.assignmentStart || !extra.assignmentEnd)) return 'A coordinator needs at least one programme and an assignment start & end date.';
    if (role === 'COORDINATOR' && extra.assignmentStart && extra.assignmentEnd && extra.assignmentEnd < extra.assignmentStart) return 'The assignment end date cannot be before its start date.';
    if (role === 'ADMISSIONS_OFFICER' && !(extra.callIds?.length || extra.callId)) return 'Please assign the officer to at least one real call for application.';
    return '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }

    setSaving(true);
    try {
      await onCreate({ title, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role, ...extra });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue focus:border-kyu-blue text-sm';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="create-account-title" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 bg-kyu-blue rounded-t-xl">
          <div>
            <h3 id="create-account-title" className="text-lg font-bold text-white">Create Account</h3>
            <p className="text-xs text-blue-100">Delegation-aware · you are creating as {roleLabels[creator]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white hover:bg-kyu-blue-dark"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Show only roles this manager is authorised to create. */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Role *</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((r) => {
                const Icon = roleIcons[r];
                return (
                  <button type="button" key={r} onClick={() => pickRole(r)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${role === r ? 'border-kyu-orange bg-kyu-orange/10' : 'border-gray-200 hover:border-kyu-blue/50'}`}>
                    <Icon size={18} className={role === r ? 'text-kyu-orange-dark' : 'text-gray-400'} />
                    <p className="mt-1 text-xs font-semibold text-gray-800">{roleLabels[r]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
              <select value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass}>
                {['Prof.', 'Dr.', 'Mr.', 'Ms.', 'Mrs.'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="Jane" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Namutebi" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Institutional Email *</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@kyu.ac.ug" />
          </div>

          {/* The shape-shifting delegation fields */}
          <DynamicRoleFields role={role} extra={extra} onChange={patch} options={lookupOptions} />

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 sm:w-auto">Cancel</button>
            <button type="submit" disabled={saving} className="w-full rounded-lg bg-kyu-orange px-5 py-2 text-sm font-bold text-kyu-blue-dark shadow hover:bg-kyu-orange-dark disabled:opacity-60 sm:w-auto">
              {saving ? 'Creating…' : 'Create & Send Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
