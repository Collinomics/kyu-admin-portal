import { staffStatusLabels } from '../types';
import type { StaffStatus, UserAccount, UserManagementOptions, UserRole } from '../types';
import KySearchSelect from '../../../components/ui/KySearchSelect';
import KyMultiSearchSelect from '../../../components/ui/KyMultiSearchSelect';

type Extra = Partial<UserAccount>;

interface Props {
  role: UserRole;
  extra: Extra;
  onChange: (patch: Extra) => void;
  options: UserManagementOptions;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue focus:border-kyu-blue text-sm';
const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

// Renders only the fields required by the selected role.
export default function DynamicRoleFields({ role, extra, onChange, options }: Props) {
  if (role === 'DEAN') {
    return (
      <div>
        <KySearchSelect label="Faculty / School to Head *" value={extra.facultyId ?? ''} options={options.faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))} onChange={(value) => {
          const faculty = options.faculties.find((item) => item.id === value);
          onChange({ facultyId: faculty?.id, faculty: faculty?.name });
        }} placeholder="Select or type a faculty/school…" />
      </div>
    );
  }

  if (role === 'HOD') {
    const facultyDepts = options.faculties.find((faculty) => faculty.id === extra.facultyId)?.departments ?? [];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <KySearchSelect label="Faculty / School *" value={extra.facultyId ?? ''} options={options.faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))} onChange={(value) => {
            const faculty = options.faculties.find((item) => item.id === value);
            onChange({ facultyId: faculty?.id, faculty: faculty?.name, departmentId: undefined, department: undefined });
          }} placeholder="Select or type a faculty…" />
        </div>
        <div>
          <KySearchSelect label="Department to Head *" value={extra.departmentId ?? ''} options={facultyDepts.map((department) => ({ value: department.id, label: department.name }))} onChange={(value) => {
            const department = facultyDepts.find((item) => item.id === value);
            onChange({ departmentId: department?.id, department: department?.name });
          }} disabled={!extra.facultyId} placeholder={extra.facultyId ? 'Select or type a department…' : 'Choose faculty first'} />
        </div>
      </div>
    );
  }

  if (role === 'COORDINATOR') {
    const selectedProgrammeIds = extra.programmeIds ?? (extra.programmeId ? [extra.programmeId] : []);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Staff Status *</label>
            <select value={extra.staffStatus ?? 'permanent'} onChange={(e) => onChange({ staffStatus: e.target.value as StaffStatus })} className={inputClass}>
              {(Object.keys(staffStatusLabels) as StaffStatus[]).map((s) => (
                <option key={s} value={s}>{staffStatusLabels[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <KyMultiSearchSelect label="Assigned Programmes *" values={selectedProgrammeIds} onChange={(values) => onChange({ programmeIds: values, programmeId: values[0] })} disabled={options.programmes.length === 0} placeholder={options.programmes.length > 0 ? 'Type and add a programme…' : 'No programmes available in your scope'} options={options.programmes.map((programme) => ({ value: programme.id, label: `${programme.code ? `${programme.code} — ` : ''}${programme.name}${programme.academic_unit ? ` · ${programme.academic_unit}` : ''}`, keywords: programme.department }))} />
            {options.programmes.length === 0 && <p className="mt-1 text-xs text-amber-700">A programme must exist in your faculty or school before assigning its Coordinator.</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Assignment Start *</label>
            <input type="date" value={extra.assignmentStart ?? ''} onChange={(e) => onChange({ assignmentStart: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Assignment End *</label>
            <input type="date" min={extra.assignmentStart ?? undefined} value={extra.assignmentEnd ?? ''} onChange={(e) => onChange({ assignmentEnd: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Mandatory Instructions (optional)</label>
          <textarea rows={2} value={extra.instructions ?? ''} onChange={(e) => onChange({ instructions: e.target.value })} className={inputClass} placeholder="e.g. Follow the standard metadata schema; submit by 30th…" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={extra.priorReview ?? true} onChange={(e) => onChange({ priorReview: e.target.checked })} className="w-4 h-4 accent-kyu-blue" />
          Submissions require my prior review before reaching the Dean 
        </label>
      </div>
    );
  }

  if (role === 'ADMISSIONS_OFFICER') {
    const perms = extra.permissions ?? { create: true, monitor: true, close: false };
    const selectedCallIds = extra.callIds ?? (extra.callId ? [extra.callId] : []);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Staff Status *</label>
            <select value={extra.staffStatus ?? 'permanent'} onChange={(e) => onChange({ staffStatus: e.target.value as StaffStatus })} className={inputClass}>
              {(Object.keys(staffStatusLabels) as StaffStatus[]).map((s) => (
                <option key={s} value={s}>{staffStatusLabels[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <KyMultiSearchSelect label="Assigned Calls / Programmes *" values={selectedCallIds} onChange={(values) => onChange({ callIds: values, callId: values[0] })} disabled={options.calls.length === 0} placeholder={options.calls.length > 0 ? 'Type and add an application call…' : 'No assignable calls available'} options={options.calls.map((call) => ({ value: call.id, label: call.name }))} />
            {options.calls.length === 0 && <p className="mt-1 text-xs text-amber-700">Create an eligible draft or open application call before assigning an officer.</p>}
          </div>
        </div>
        <div>
          <label className={labelClass}>Delegated Permissions  (close is off by default)</label>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={perms.create} onChange={(e) => onChange({ permissions: { ...perms, create: e.target.checked } })} className="w-4 h-4 accent-kyu-blue" /> Create
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={perms.monitor} onChange={(e) => onChange({ permissions: { ...perms, monitor: e.target.checked } })} className="w-4 h-4 accent-kyu-blue" /> Monitor
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={perms.close} onChange={(e) => onChange({ permissions: { ...perms, close: e.target.checked } })} className="w-4 h-4 accent-kyu-orange" /> Close
            </label>
          </div>
        </div>
      </div>
    );
  }

  // REGISTRAR: no extra fields (division is implicit)
  return null;
}
