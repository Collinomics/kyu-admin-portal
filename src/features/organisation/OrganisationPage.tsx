import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Edit3, Plus, Search, Users } from 'lucide-react';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import KyBadge from '../../components/ui/KyBadge';
import KyModal from '../../components/ui/KyModal';
import KyConfirm from '../../components/ui/KyConfirm';
import { KyInput } from '../../components/ui/KyField';
import KyEmpty from '../../components/ui/KyEmpty';
import { useToast } from '../../components/ui/KyToast';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import {
  createDepartment,
  createFaculty,
  fetchOrganisation,
  updateDepartment,
  updateFaculty,
  type DepartmentUnit,
  type FacultyUnit,
} from './organisationService';

type Editor =
  | { kind: 'faculty'; item?: FacultyUnit }
  | { kind: 'department'; faculty: FacultyUnit; item?: DepartmentUnit };

type ToggleTarget = { kind: 'faculty'; item: FacultyUnit } | { kind: 'department'; item: DepartmentUnit };

function UnitEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => Promise<void> }) {
  const item = editor.item;
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Both the official code and name are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editor.kind === 'faculty') {
        if (editor.item) await updateFaculty(editor.item.id, { code, name, is_active: editor.item.is_active });
        else await createFaculty({ code, name });
      } else if (editor.item) {
        await updateDepartment(editor.item.id, { code, name, is_active: editor.item.is_active });
      } else {
        await createDepartment(editor.faculty.id, { code, name });
      }
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The organisation unit could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const label = editor.kind === 'faculty' ? 'Faculty / School' : 'Department';
  return (
    <KyModal open title={`${item ? 'Edit' : 'Add'} ${label}`} subtitle={editor.kind === 'department' ? `Within ${editor.faculty.name}` : 'Canonical university organisation structure'} onClose={onClose}
      footer={<><KyButton variant="outline" onClick={onClose}>Cancel</KyButton><KyButton type="submit" form="organisation-unit-form" loading={saving}>Save Unit</KyButton></>}>
      <form id="organisation-unit-form" onSubmit={save} className="space-y-4">
        <KyInput label="Official code" help="Letters, numbers, underscores and hyphens only." value={code} maxLength={30} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder={editor.kind === 'faculty' ? 'SCI' : 'CS'} />
        <KyInput label="Official name" value={name} maxLength={255} onChange={(event) => setName(event.target.value)} placeholder={editor.kind === 'faculty' ? 'Faculty of Science' : 'Computer Science'} />
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </KyModal>
  );
}

export default function OrganisationPage() {
  const [faculties, setFaculties] = useState<FacultyUnit[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchOrganisation();
      setFaculties(data);
      setSelectedId((current) => data.some((item) => item.id === current) ? current : (data[0]?.id ?? ''));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The organisation structure could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useBackgroundRefresh(async () => {
    const data = await fetchOrganisation();
    setFaculties(data);
    setError('');
    setSelectedId((current) => data.some((item) => item.id === current) ? current : (data[0]?.id ?? ''));
  }, 'standard');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return faculties;
    return faculties.filter((faculty) => `${faculty.code} ${faculty.name} ${faculty.departments.map((department) => `${department.code} ${department.name}`).join(' ')}`.toLowerCase().includes(needle));
  }, [faculties, query]);
  const selected = filtered.find((faculty) => faculty.id === selectedId) ?? filtered[0];

  const toggle = async (password?: string) => {
    if (!toggleTarget) return;
    const nextActive = !toggleTarget.item.is_active;
    if (toggleTarget.kind === 'faculty') {
      await updateFaculty(toggleTarget.item.id, { code: toggleTarget.item.code, name: toggleTarget.item.name, is_active: nextActive, current_password: password });
    } else {
      await updateDepartment(toggleTarget.item.id, { code: toggleTarget.item.code, name: toggleTarget.item.name, is_active: nextActive, current_password: password });
    }
    setToggleTarget(null);
    await load();
    toast(`${toggleTarget.item.name} ${nextActive ? 'activated' : 'deactivated'} and recorded in the Audit Log.`, 'success');
  };

  return (
    <div className="space-y-6">
      <KyPageHeader title="Organisation Structure" subtitle="Manage the faculties, schools and departments used throughout PCS"
        actions={<KyButton icon={<Plus size={16} />} onClick={() => setEditor({ kind: 'faculty' })}>Add Faculty / School</KyButton>} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        Deactivated units remain attached to historical programmes and audit records, but they are removed from new staff and programme assignment options.
      </div>
      {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">{error}</p><KyButton size="sm" variant="outline" onClick={() => void load()}>Retry</KyButton></div>}

      <div className="relative max-w-xl">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-kyu-blue focus:outline-none focus:ring-2 focus:ring-kyu-blue/30" placeholder="Search faculty, department or code…" />
      </div>

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Loading organisation structure…</div>
        : faculties.length === 0 ? <KyEmpty icon={<Building2 size={26} />} title="No organisation units configured" hint="Add the first faculty or school to begin assigning programmes and staff." />
          : <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3"><h2 className="font-bold text-gray-800">Faculties & Schools</h2><p className="text-xs text-gray-400">{faculties.length} configured</p></div>
              <div className="max-h-[620px] divide-y divide-gray-100 overflow-y-auto">
                {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">No faculty, school or department matches this search.</p>}
                {filtered.map((faculty) => <button key={faculty.id} onClick={() => setSelectedId(faculty.id)} className={`w-full px-4 py-3 text-left transition ${selected?.id === faculty.id ? 'bg-blue-50 ring-1 ring-inset ring-kyu-blue/20' : 'hover:bg-gray-50'}`}>
                  <span className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-sm font-bold text-gray-800">{faculty.name}</span><span className="mt-0.5 block text-[11px] font-semibold text-gray-400">{faculty.code} · {faculty.departments.length} departments</span></span><KyBadge tone={faculty.is_active ? 'green' : 'gray'}>{faculty.is_active ? 'Active' : 'Inactive'}</KyBadge></span>
                </button>)}
              </div>
            </section>

            {selected && <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-800">{selected.name}</h2><KyBadge tone={selected.is_active ? 'green' : 'gray'}>{selected.is_active ? 'Active' : 'Inactive'}</KyBadge></div><p className="mt-1 text-xs text-gray-400">{selected.code} · {selected.programmes_count} programmes · {selected.active_assignments_count} active staff assignments</p></div>
                <div className="flex flex-wrap gap-2"><KyButton size="sm" variant="outline" icon={<Edit3 size={14} />} onClick={() => setEditor({ kind: 'faculty', item: selected })}>Edit</KyButton><KyButton size="sm" variant={selected.is_active ? 'danger' : 'outline'} onClick={() => setToggleTarget({ kind: 'faculty', item: selected })}>{selected.is_active ? 'Deactivate' : 'Activate'}</KyButton></div>
              </div>
              <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3"><div><h3 className="text-sm font-bold text-gray-700">Departments</h3><p className="text-[11px] text-gray-400">Operational units under this faculty or school</p></div><KyButton size="sm" disabled={!selected.is_active} icon={<Plus size={14} />} onClick={() => setEditor({ kind: 'department', faculty: selected })}>Add Department</KyButton></div>
              {selected.departments.length === 0 ? <div className="p-8 text-center text-sm text-gray-400">No departments configured for this unit.</div> : <div className="divide-y divide-gray-100">
                {selected.departments.map((department) => <div key={department.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-gray-800">{department.name}</p><KyBadge tone={department.is_active ? 'green' : 'gray'}>{department.is_active ? 'Active' : 'Inactive'}</KyBadge></div><p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400"><span>{department.code}</span><span>·</span><span>{department.programmes_count} programmes</span><span>·</span><span className="inline-flex items-center gap-1"><Users size={11} /> {department.active_assignments_count} active staff</span></p></div>
                  <div className="flex shrink-0 gap-2"><KyButton size="sm" variant="ghost" icon={<Edit3 size={14} />} onClick={() => setEditor({ kind: 'department', faculty: selected, item: department })}>Edit</KyButton><KyButton size="sm" variant={department.is_active ? 'danger' : 'outline'} disabled={!selected.is_active && !department.is_active} onClick={() => setToggleTarget({ kind: 'department', item: department })}>{department.is_active ? 'Deactivate' : 'Activate'}</KyButton></div>
                </div>)}
              </div>}
            </section>}
          </div>}

      {editor && <UnitEditor editor={editor} onClose={() => setEditor(null)} onSaved={async () => { await load(); toast('Organisation unit saved and recorded in the Audit Log.', 'success'); }} />}
      {toggleTarget && <KyConfirm open title={`${toggleTarget.item.is_active ? 'Deactivate' : 'Activate'} organisation unit?`}
        message={toggleTarget.item.is_active ? `${toggleTarget.item.name} will no longer appear in new assignment options.${toggleTarget.kind === 'faculty' ? ' Its departments will also be deactivated.' : ''}` : `${toggleTarget.item.name} will become available for new assignments.`}
        confirmLabel={toggleTarget.item.is_active ? 'Deactivate Unit' : 'Activate Unit'} tone={toggleTarget.item.is_active ? 'danger' : 'primary'} stepUp={toggleTarget.item.is_active}
        onConfirm={toggle} onCancel={() => setToggleTarget(null)} />}
    </div>
  );
}
