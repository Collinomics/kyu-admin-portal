import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Inbox, Plus, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { UserManagementOptions } from '../users/types';
import type { ProgrammeProfile, ProgrammeStatus } from './types';
import { emptyProfile, statusMeta } from './types';
import {
  deleteProgramme,
  fetchProgrammeOptions,
  fetchProgrammes,
  runProgrammeAction,
  saveProgramme,
  type ProgrammePageMeta,
} from './programmeService';
import ProgrammeEditor from './components/ProgrammeEditor';
import ProgrammeView from './components/ProgrammeView';
import RejectDialog from './components/RejectDialog';
import RecommendDialog from './components/RecommendDialog';
import UnpublishDialog from './components/UnpublishDialog';
import KyConfirm from '../../components/ui/KyConfirm';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import KyBadge from '../../components/ui/KyBadge';
import KyEmpty from '../../components/ui/KyEmpty';
import KyStatCard from '../../components/ui/KyStatCard';
import { useToast } from '../../components/ui/KyToast';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchApi } from '../../services/api';

const EMPTY_META: ProgrammePageMeta = {
  currentPage: 1,
  lastPage: 1,
  perPage: 10,
  total: 0,
  statusCounts: {},
};

export default function ProgrammesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = user?.role ?? 'SYSADMIN';
  const [programmes, setProgrammes] = useState<ProgrammeProfile[]>([]);
  const [meta, setMeta] = useState<ProgrammePageMeta>(EMPTY_META);
  const [options, setOptions] = useState<UserManagementOptions | null>(null);
  const [page, setPage] = useState(1);
  const search = searchParams.get('search') ?? '';
  const targetId = searchParams.get('target');
  const requestedStatus = searchParams.get('status');
  const status: ProgrammeStatus | 'all' = requestedStatus && requestedStatus in statusMeta ? requestedStatus as ProgrammeStatus : 'all';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ProgrammeProfile | null>(null);
  const [viewing, setViewing] = useState<ProgrammeProfile | null>(null);
  const [rejecting, setRejecting] = useState<ProgrammeProfile | null>(null);
  const [recommending, setRecommending] = useState<ProgrammeProfile | null>(null);
  const [unpublishing, setUnpublishing] = useState<ProgrammeProfile | null>(null);
  const [deleting, setDeleting] = useState<ProgrammeProfile | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const { toast } = useToast();
  const refreshSignatureRef = useRef('');
  refreshSignatureRef.current = `${page}|${search}|${status}`;
  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  };
  const setStatus = (value: ProgrammeStatus | 'all') => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  };

  const load = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchProgrammes({ page: targetPage, search: search.trim(), status, perPage: 10 });
      setProgrammes(result.programmes);
      setMeta(result.meta);
      if (result.meta.currentPage !== targetPage) setPage(result.meta.currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Programme data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgrammeOptions().then(setOptions).catch((err) => setError(err instanceof Error ? err.message : 'Programme options could not be loaded.'));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(page), search ? 300 : 0);
    return () => window.clearTimeout(timer);
    // Loading is driven only by the visible filters and page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status]);

  useBackgroundRefresh(async () => {
    const signature = `${page}|${search}|${status}`;
    const result = await fetchProgrammes({ page, search: search.trim(), status, perPage: 10 });
    if (refreshSignatureRef.current !== signature) return;
    setProgrammes(result.programmes);
    setMeta(result.meta);
    setError('');
    setViewing((current) => current ? result.programmes.find((programme) => programme.id === current.id) ?? current : null);
  }, 'standard');

  useEffect(() => {
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > meta.lastPage) continue;
      const params = new URLSearchParams({ page: String(targetPage), per_page: '10' });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      void prefetchApi(`/api/v1/programmes?${params}`);
    }
  }, [page, meta.lastPage, search, status]);

  useEffect(() => {
    if (!targetId) return;
    setPage(1);
  }, [targetId]);

  useEffect(() => {
    if (!targetId || loading) return;
    const target = programmes.find((programme) => programme.id === targetId);
    if (target) setViewing(target);
  }, [loading, programmes, targetId]);

  const closeViewing = () => {
    setViewing(null);
    if (!targetId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    setSearchParams(next, { replace: true });
  };

  const refresh = async () => load(page);

  const save = async (programme: ProgrammeProfile, intent: 'draft' | 'submit' | 'publish', message: string) => {
    try {
      await saveProgramme(programme, intent);
      setEditing(null);
      await refresh();
      toast(message, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The programme could not be saved.', 'error');
    }
  };

  const action = async (programme: ProgrammeProfile, next: 'forward' | 'publish' | 'unpublish' | 'reject' | 'recommend', comment?: string) => {
    if (actingId) return;
    setActingId(programme.id);
    try {
      await runProgrammeAction(programme, next, comment);
      setRejecting(null);
      setRecommending(null);
      setUnpublishing(null);
      await refresh();
      toast(
        next === 'forward' ? 'Forwarded to the Dean for a final decision.'
          : next === 'publish' ? `${programme.name} is now published.`
            : next === 'unpublish' ? `${programme.name} was removed from the public catalogue and queued for AI removal.`
            : next === 'recommend' ? 'Advisory recommendation recorded; the programme remains ready for the Dean’s decision.'
              : 'Returned to the coordinator with review comments.',
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The action could not be completed.', 'error');
    } finally {
      setActingId(null);
    }
  };

  const remove = async (password?: string) => {
    if (!deleting) return;
    await deleteProgramme(deleting.id, password);
    toast(`${deleting.name} was permanently deleted.`, 'success');
    setDeleting(null);
    await refresh();
  };

  const canCreate = role === 'SYSADMIN';
  const subtitle = role === 'SYSADMIN'
    ? 'Canonical programme catalogue — versioned editing and publication oversight'
    : 'Your role-scoped programme review and publication workspace';
  const statusCounts = meta.statusCounts;

  return (
    <div className="space-y-6">
      <KyPageHeader
        title="Course Profiling"
        subtitle={subtitle}
        actions={canCreate && options ? (
          <KyButton variant="accent" icon={<Plus size={16} />} onClick={() => setEditing(emptyProfile(user?.name ?? ''))}>
            New Programme
          </KyButton>
        ) : undefined}
      />

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${role === 'SYSADMIN' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <KyStatCard label="Visible Programmes" value={meta.total} hint="matching the current filters" icon={BookOpen} tone="text-kyu-blue bg-kyu-blue/10" />
        <KyStatCard label="Published" value={statusCounts.published ?? 0} hint="live canonical profiles" icon={CheckCircle2} tone="text-green-600 bg-green-100" />
        {role === 'SYSADMIN' ? <>
          <KyStatCard label="Awaiting HOD Review" value={statusCounts.submitted ?? 0} hint="submitted by coordinators" icon={Inbox} tone="text-kyu-orange-dark bg-kyu-orange/20" />
          <KyStatCard label="Awaiting Dean Review" value={statusCounts['hod-reviewed'] ?? 0} hint="forwarded by HODs" icon={Inbox} tone="text-purple-700 bg-purple-100" />
        </> : <KyStatCard label="Awaiting Review" value={(statusCounts.submitted ?? 0) + (statusCounts['hod-reviewed'] ?? 0)} hint="in the approval pipeline" icon={Inbox} tone="text-kyu-orange-dark bg-kyu-orange/20" />}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by programme name or code..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ProgrammeStatus | 'all');
            setPage(1);
          }}
          className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
        >
          <option value="all">All statuses</option>
          {(Object.keys(statusMeta) as ProgrammeStatus[]).map((value) => <option key={value} value={value}>{statusMeta[value].label}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <KyButton size="sm" variant="outline" onClick={() => void refresh()}>Try Again</KyButton>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">Loading programmes…</div>
      ) : programmes.length === 0 ? (
        <KyEmpty title="No programmes found" hint="Adjust the search or status filter." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {programmes.map((programme) => (
            <div key={programme.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3">
              <button onClick={() => setViewing(programme)} className="min-w-0 text-left flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate hover:text-kyu-blue">{programme.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{programme.code} · {programme.category} · {programme.faculty} · {programme.coordinator}{programme.liveVersion && programme.liveVersion !== programme.version ? ` · v${programme.liveVersion} remains live` : ''}</p>
              </button>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <KyBadge tone={statusMeta[programme.status].tone}>{statusMeta[programme.status].label}</KyBadge>
                <KyButton size="sm" variant="outline" onClick={() => setViewing(programme)}>View</KyButton>
                {role === 'SYSADMIN' && <KyButton size="sm" variant="outline" onClick={() => setEditing(programme)}>Edit / Publish</KyButton>}
                {role === 'COORDINATOR' && ['draft', 'rejected', 'published'].includes(programme.status) && <KyButton size="sm" onClick={() => setEditing(programme)}>{programme.status === 'published' ? 'Propose Revision' : 'Open Editor'}</KyButton>}
                {role === 'HOD' && programme.status === 'submitted' && <KyButton size="sm" loading={actingId === programme.id} disabled={actingId !== null} onClick={() => void action(programme, 'forward')}>Forward</KyButton>}
                {role === 'HOD' && programme.status === 'submitted' && <KyButton size="sm" variant="danger" disabled={actingId !== null} onClick={() => setRejecting(programme)}>Reject</KyButton>}
                {role === 'DEAN' && programme.status === 'hod-reviewed' && <KyButton size="sm" variant="accent" loading={actingId === programme.id} disabled={actingId !== null} onClick={() => void action(programme, 'publish')}>Publish</KyButton>}
                {role === 'DEAN' && programme.status === 'hod-reviewed' && <KyButton size="sm" variant="outline" disabled={actingId !== null} onClick={() => setRecommending(programme)}>Recommend</KyButton>}
                {role === 'DEAN' && programme.status === 'hod-reviewed' && <KyButton size="sm" variant="danger" disabled={actingId !== null} onClick={() => setRejecting(programme)}>Reject</KyButton>}
                {['SYSADMIN', 'DEAN'].includes(role) && programme.status === 'published' && <KyButton size="sm" variant="danger" disabled={actingId !== null} onClick={() => setUnpublishing(programme)}>Unpublish</KyButton>}
                {role === 'SYSADMIN' && ['draft', 'rejected'].includes(programme.status) && <KyButton size="sm" variant="danger" onClick={() => setDeleting(programme)}>Delete</KyButton>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && meta.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <span>Page {meta.currentPage} of {meta.lastPage} · {meta.perPage} per page · {meta.total} results</span>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
            <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page >= meta.lastPage} onClick={() => setPage((value) => value + 1)}>Next</button>
            <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page >= meta.lastPage} onClick={() => setPage(meta.lastPage)}>Last</button>
          </div>
        </div>
      )}

      <ProgrammeView programme={viewing} onClose={closeViewing} />
      {editing && options && (
        <ProgrammeEditor
          programme={editing}
          options={options}
          submitLabel={role === 'SYSADMIN' ? 'Publish Now' : 'Submit for HOD Review'}
          saveLabel={role === 'SYSADMIN' && editing.status === 'published' ? 'Save Changes & Keep Published' : undefined}
          onClose={() => setEditing(null)}
          onSaveDraft={(profile) => save(profile, role === 'SYSADMIN' && editing.status === 'published' ? 'publish' : 'draft', 'Programme changes saved.')}
          onSubmit={(profile) => save(profile, role === 'SYSADMIN' ? 'publish' : 'submit', role === 'SYSADMIN' ? 'Programme published and queued for AI indexing.' : 'Programme submitted for review.')}
        />
      )}
      <RejectDialog programme={rejecting} loading={Boolean(rejecting && actingId === rejecting.id)} onClose={() => setRejecting(null)} onReject={(comment) => rejecting && void action(rejecting, 'reject', comment)} />
      <RecommendDialog programme={recommending} loading={Boolean(recommending && actingId === recommending.id)} onClose={() => setRecommending(null)} onSend={(comment) => recommending && void action(recommending, 'recommend', comment)} />
      <UnpublishDialog programme={unpublishing} loading={Boolean(unpublishing && actingId === unpublishing.id)} onClose={() => setUnpublishing(null)} onConfirm={(reason) => unpublishing && void action(unpublishing, 'unpublish', reason)} />
      {deleting && (
        <KyConfirm
          open
          tone="danger"
          stepUp
          title="Delete this draft programme?"
          message={`${deleting.name} will be permanently deleted. Published catalogue records cannot be deleted from this screen.`}
          confirmLabel="Delete Permanently"
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
