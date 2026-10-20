import { useState } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyInput, KySelect, KyTextarea } from '../../../components/ui/KyField';
import type { ProgrammeProfile } from '../types';
import { categories, statusMeta } from '../types';
import type { UserManagementOptions } from '../../users/types';
import { useAuth } from '../../auth/AuthContext';
import KySearchSelect from '../../../components/ui/KySearchSelect';

interface Props {
  programme: ProgrammeProfile;
  onClose: () => void;
  onSaveDraft: (p: ProgrammeProfile) => Promise<void>;
  onSubmit: (p: ProgrammeProfile) => Promise<void>;
  submitLabel?: string;
  saveLabel?: string;
  options: UserManagementOptions;
}

const sections: Array<{ key: keyof ProgrammeProfile; label: string; help: string }> = [
  { key: 'overview', label: 'Overview', help: 'What this programme is and who it serves.' },
  { key: 'objectiveImpact', label: 'Objective / Impact', help: 'What graduates achieve and the value to society.' },
  { key: 'philosophyOriginality', label: 'Philosophy & Originality', help: 'The thinking behind it and what makes it distinct.' },
  { key: 'careerProspects', label: 'Career Prospects', help: 'Typical roles and paths after graduation.' },
  { key: 'admissionRequirements', label: 'Admission Requirements', help: 'Entry qualifications and conditions.' },
  { key: 'structureContent', label: 'Structure & Content', help: 'Duration, units and delivery mode.' },
];

const studyModeOptions = ['Day', 'Evening', 'Weekend', 'Distance', 'Online'];

export default function ProgrammeEditor({ programme, onClose, onSaveDraft, onSubmit, submitLabel, saveLabel, options }: Props) {
  const [form, setForm] = useState<ProgrammeProfile>({ ...programme });
  const [savingAction, setSavingAction] = useState<'save' | 'submit' | null>(null);
  const { user } = useAuth();
  const canChangeOrganisation = user?.role === 'SYSADMIN';

  const patch = (p: Partial<ProgrammeProfile>) => setForm((f) => ({ ...f, ...p }));

  const draftReady = form.name.trim() !== '' && form.code.trim() !== '';
  const complete =
    draftReady && Boolean(form.facultyId) &&
    sections.every((s) => String(form[s.key] ?? '').trim().length > 0);

  const persist = async (action: 'save' | 'submit') => {
    if (savingAction) return;
    setSavingAction(action);
    try {
      await (action === 'save' ? onSaveDraft(form) : onSubmit(form));
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <KyModal
      open
      size="lg"
      title={programme.name ? `Edit — ${programme.name}` : 'New Programme Profile'}
      subtitle={`Standard metadata schema · currently ${statusMeta[form.status].label}`}
      onClose={onClose}
      footer={
        <>
          <KyButton variant="outline" disabled={!draftReady || savingAction !== null} loading={savingAction === 'save'} onClick={() => void persist('save')}>{saveLabel ?? 'Save as Draft'}</KyButton>
          <KyButton disabled={!complete || savingAction !== null} loading={savingAction === 'submit'} onClick={() => void persist('submit')}>{submitLabel ?? 'Submit for HOD Review'}</KyButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KyInput label="Programme name" help="As it should appear in the catalogue." value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. BSc Computer Science" />
          <KyInput label="Programme code" help="Internal code, e.g. BCS." value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="e.g. BCS" />
          <KySelect label="Category" value={form.category} onChange={(e) => patch({ category: e.target.value as ProgrammeProfile['category'] })}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </KySelect>
          <KySearchSelect label="Faculty / School" help={canChangeOrganisation ? 'Official academic ownership of this programme.' : 'Managed by the System Administrator.'} value={form.facultyId ?? ''} disabled={!canChangeOrganisation} options={options.faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))} onChange={(value) => {
            const faculty = options.faculties.find((item) => item.id === value);
            patch({ facultyId: faculty?.id, faculty: faculty?.name ?? '', departmentId: undefined, department: '' });
          }} placeholder="Select or type a faculty/school…" />
          <KySearchSelect label="Department" help={canChangeOrganisation ? 'Select a department within the academic unit.' : 'Managed by the System Administrator.'} value={form.departmentId ?? ''} options={(options.faculties.find((faculty) => faculty.id === form.facultyId)?.departments ?? []).map((department) => ({ value: department.id, label: department.name }))} onChange={(value) => {
            const departments = options.faculties.find((faculty) => faculty.id === form.facultyId)?.departments ?? [];
            const department = departments.find((item) => item.id === value);
            patch({ departmentId: department?.id, department: department?.name ?? '' });
          }} disabled={!canChangeOrganisation || !form.facultyId} placeholder={form.facultyId ? 'Select or type a department…' : 'Choose faculty first'} />
        </div>

        <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div>
            <h4 className="text-sm font-bold text-kyu-blue-dark">Public catalogue facts</h4>
            <p className="mt-0.5 text-xs text-gray-500">Structured information displayed on programme cards. Leave unknown values empty rather than estimating them.</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KyInput label="Duration" help="For example: 3 Years or 2 Semesters." value={form.duration} onChange={(e) => patch({ duration: e.target.value })} placeholder="e.g. 3 Years" maxLength={60} />
            <KyInput label="Campus / Learning centre" help="Official delivery location." value={form.campus} onChange={(e) => patch({ campus: e.target.value })} placeholder="e.g. Main Campus" maxLength={120} />
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-gray-700">Study modes</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {studyModeOptions.map((mode) => {
                const selected = form.studyModes.includes(mode);
                return <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${selected ? 'border-kyu-blue bg-kyu-blue text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>
                  <input type="checkbox" checked={selected} onChange={() => patch({ studyModes: selected ? form.studyModes.filter((item) => item !== mode) : [...form.studyModes, mode] })} className="sr-only" />
                  {mode}
                </label>;
              })}
            </div>
          </fieldset>
        </section>

        {user?.role === 'SYSADMIN' && <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h4 className="text-sm font-bold text-amber-900">Catalogue curation</h4>
          <p className="mt-0.5 text-xs text-amber-800">Administrator-only controls for highlighted programmes and their ordering.</p>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-2">
            <label className="flex min-h-[66px] cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-white px-4 py-3">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => patch({ isFeatured: e.target.checked })} className="h-4 w-4 accent-amber-600" />
              <span><span className="block text-sm font-bold text-gray-800">Feature this programme</span><span className="text-[11px] text-gray-500">Adds a verified Featured badge.</span></span>
            </label>
            <KyInput type="number" min={0} max={1000} label="Display priority" help="Higher numbers appear first; 0 uses alphabetical order." value={form.displayPriority} onChange={(e) => patch({ displayPriority: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} />
          </div>
        </section>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sections.map((s) => (
            <KyTextarea
              key={s.key}
              label={s.label}
              help={s.help}
              rows={3}
              value={String(form[s.key] ?? '')}
              onChange={(e) => patch({ [s.key]: e.target.value } as Partial<ProgrammeProfile>)}
            />
          ))}
        </div>

        {!complete && (
          <p className="text-[11px] text-gray-400">
            A draft requires a programme name and code. Submission also requires official academic ownership and all six programme sections.
          </p>
        )}
      </div>
    </KyModal>
  );
}
