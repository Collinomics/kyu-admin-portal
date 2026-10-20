import { useEffect, useRef, useState } from 'react';
import { Archive, CalendarClock, Eye, Megaphone, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { ApplicationCall, ApplicationCallInput } from './types';
import { callStatusMeta, daysLeft, effectiveStatus } from './types';
import {
  closeCall as closeCallRequest,
  createCall,
  delegateCall,
  fetchAdmissionsOptions,
  fetchCalls,
  publishCall,
  reopenCall,
  updateCall,
  type AdmissionsOptions,
  type CallsMeta,
} from './admissionsService';
import CreateCallModal from './components/CreateCallModal';
import CloseCallDialog from './components/CloseCallDialog';
import DelegateDialog from './components/DelegateDialog';
import ReopenCallDialog from './components/ReopenCallDialog';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import KyBadge from '../../components/ui/KyBadge';
import KyStatCard from '../../components/ui/KyStatCard';
import KyEmpty from '../../components/ui/KyEmpty';
import { useToast } from '../../components/ui/KyToast';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchApi } from '../../services/api';

const EMPTY_META: CallsMeta = { currentPage: 1, lastPage: 1, perPage: 10, total: 0, statusCounts: {} };

export default function AdmissionsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? 'all';
  const targetId = searchParams.get('target');
  const role = user?.role ?? 'SYSADMIN';
  const allowed = ['SYSADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER'].includes(role);
  const managesAll = role === 'SYSADMIN' || role === 'REGISTRAR';
  const [calls, setCalls] = useState<ApplicationCall[]>([]);
  const [meta, setMeta] = useState<CallsMeta>(EMPTY_META);
  const [options, setOptions] = useState<AdmissionsOptions>({ programmes: [], officers: [], capabilities: { can_create: false }, closing_soon_days: 7 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApplicationCall | null>(null);
  const [closing, setClosing] = useState<ApplicationCall | null>(null);
  const [delegating, setDelegating] = useState<ApplicationCall | null>(null);
  const [reopening, setReopening] = useState<ApplicationCall | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const { toast } = useToast();
  const refreshSignatureRef = useRef('');
  refreshSignatureRef.current = `${page}|${search}|${status}`;
  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
    setPage(1);
  };
  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value !== 'all') next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const load = async (targetPage = page) => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchCalls(targetPage, 10, search, status);
      setCalls(result.calls);
      setMeta(result.meta);
      if (result.meta.currentPage !== targetPage) setPage(result.meta.currentPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Application calls could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    void load(page);
    // Page changes are the only automatic refresh trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, allowed, search, status]);

  useBackgroundRefresh(async () => {
    if (!allowed) return;
    const signature = `${page}|${search}|${status}`;
    const result = await fetchCalls(page, 10, search, status);
    if (refreshSignatureRef.current !== signature) return;
    setCalls(result.calls);
    setMeta(result.meta);
    setError('');
  }, 'operational');

  useEffect(() => {
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > meta.lastPage) continue;
      const params = new URLSearchParams({ page: String(targetPage), per_page: '10' });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      void prefetchApi(`/api/v1/application-calls?${params}`);
    }
  }, [page, meta.lastPage, search, status]);

  useEffect(() => {
    if (!allowed) return;
    fetchAdmissionsOptions().then(setOptions).catch((reason) => setError(reason instanceof Error ? reason.message : 'Admissions options could not be loaded.'));
  }, [allowed]);

  useEffect(() => {
    if (!targetId || loading || !calls.some((call) => call.id === targetId)) return;
    document.getElementById(`application-call-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [calls, loading, targetId]);

  if (!allowed) return <KyEmpty title="Admissions" hint="Your role does not manage calls for application." />;

  const refresh = () => load(page);
  const statuses = calls.map(effectiveStatus);
  const visibleClosingSoon = statuses.filter((status) => status === 'closing-soon').length;
  const canCreate = options.capabilities.can_create;
  const closable = calls.filter((call) => call.permissions.close && ['open', 'closing-soon', 'scheduled'].includes(effectiveStatus(call))).length;

  const create = async (input: ApplicationCallInput, publish: boolean) => {
    if (acting) return;
    setActing('create');
    try {
      await createCall(input, publish);
      setCreating(false);
      await refresh();
      toast(publish ? 'Call published and now available to the admissions catalogue.' : 'Call saved as a draft.', 'success');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'The call could not be created.', 'error');
    } finally {
      setActing(null);
    }
  };

  const publishDraft = async (call: ApplicationCall) => {
    if (acting) return;
    setActing(`publish:${call.id}`);
    try {
      await publishCall(call.id);
      await refresh();
      toast('Call published successfully.', 'success');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'The call could not be published.', 'error');
    } finally {
      setActing(null);
    }
  };

  const updateSelected = async (input: ApplicationCallInput) => {
    if (!editing || acting) return;
    setActing(`edit:${editing.id}`);
    try {
      await updateCall(editing.id, input);
      setEditing(null);
      await refresh();
      toast('Call details updated and recorded in the audit trail.', 'success');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'The call could not be updated.', 'error');
    } finally {
      setActing(null);
    }
  };

  const closeSelected = async (reason: string) => {
    if (!closing || acting) return;
    setActing(`close:${closing.id}`);
    try {
      await closeCallRequest(closing.id, reason);
      setClosing(null);
      await refresh();
      toast('Call closed and recorded in the audit trail.', 'success');
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'The call could not be closed.', 'error');
    } finally {
      setActing(null);
    }
  };

  const reopenSelected = async (input: { openingDate: string; deadline: string; reason: string }) => {
    if (!reopening || acting) return;
    setActing(`reopen:${reopening.id}`);
    try {
      await reopenCall(reopening.id, input);
      setReopening(null);
      await refresh();
      toast('Call reopened with its new application window.', 'success');
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'The call could not be reopened.', 'error');
    } finally { setActing(null); }
  };

  const delegate = async (officerId: string, officerName: string, permissions: { create: boolean; monitor: boolean; close: boolean }) => {
    if (!delegating || acting) return;
    setActing(`delegate:${delegating.id}:${officerId}`);
    try {
      const updated = await delegateCall(delegating.id, officerId, permissions);
      setDelegating(updated);
      setCalls((current) => current.map((call) => call.id === updated.id ? updated : call));
      toast(`Permissions saved for ${officerName}.`, 'success');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Permissions could not be saved.', 'error');
    } finally {
      setActing(null);
    }
  };

  const daysChip = (call: ApplicationCall) => {
    const status = effectiveStatus(call);
    if (status === 'scheduled') return <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Opens {call.openingDate}</span>;
    const left = daysLeft(call.deadline);
    return <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${left <= 3 ? 'bg-red-100 text-red-600' : status === 'closing-soon' ? 'bg-kyu-orange/20 text-kyu-orange-dark' : 'bg-green-100 text-green-700'}`}>{left} days left</span>;
  };

  return (
    <div className="space-y-6">
      <KyPageHeader
        title="Admissions"
        subtitle={managesAll ? 'Real calls for application — publish, monitor, close and delegate' : 'Only calls and actions delegated to your account are shown'}
        actions={canCreate && options.programmes.length > 0 ? <KyButton variant="accent" icon={<Plus size={16} />} onClick={() => setCreating(true)}>New Call</KyButton> : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {managesAll ? <>
          <KyStatCard label="Published / Open" value={meta.statusCounts.open ?? 0} hint="includes scheduled calls" icon={Megaphone} tone="text-green-600 bg-green-100" />
          <KyStatCard label="Closing Soon Here" value={visibleClosingSoon} hint={`on this page · within ${options.closing_soon_days} days`} icon={CalendarClock} tone="text-kyu-orange-dark bg-kyu-orange/20" />
          <KyStatCard label="Closed" value={meta.statusCounts.closed ?? 0} hint="automatic or manual closure" icon={Archive} tone="text-gray-500 bg-gray-200" />
        </> : <>
          <KyStatCard label="Assigned to you" value={meta.total} hint="everything else is hidden" icon={Eye} tone="text-kyu-blue bg-kyu-blue/10" />
          <KyStatCard label="Closing soon here" value={visibleClosingSoon} hint="on this page" icon={CalendarClock} tone="text-kyu-orange-dark bg-kyu-orange/20" />
          <KyStatCard label="You may close" value={closable} hint="explicitly delegated here" icon={ShieldCheck} tone="text-green-600 bg-green-100" />
        </>}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 md:flex-row">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search application calls</span>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by programme, code or intake…"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-kyu-blue"
          />
        </label>
        <label className="flex items-center gap-2 md:w-56">
          <span className="shrink-0 text-xs font-semibold text-gray-600 md:sr-only">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-kyu-blue" aria-label="Filter application calls by status">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="open">Open</option>
            <option value="closing-soon">Closing soon</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex justify-between gap-3"><p className="text-sm text-red-700">{error}</p><KyButton size="sm" variant="outline" onClick={() => void refresh()}>Try Again</KyButton></div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">Loading application calls…</div>
      ) : calls.length === 0 ? (
        <KyEmpty title="No calls available" hint={managesAll ? 'Create the first call when a published programme is ready for applications.' : 'The Registrar has not delegated a call to you yet.'} />
      ) : (
        <div className="space-y-3">
          {calls.map((call) => {
            const status = effectiveStatus(call);
            const live = ['open', 'closing-soon', 'scheduled'].includes(status);
            return (
              <div id={`application-call-${call.id}`} key={call.id} className={`scroll-mt-24 rounded-xl border bg-white p-4 shadow-sm transition ${targetId === call.id ? 'border-kyu-orange ring-4 ring-kyu-orange/20' : 'border-gray-200'}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800">{call.programme}</p>
                      <KyBadge tone={callStatusMeta[status].tone}>{callStatusMeta[status].label}</KyBadge>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{call.intake} · {call.openingDate} → {call.deadline} · by {call.createdBy}</p>
                    {call.requirements && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{call.requirements}</p>}
                    {!managesAll && <div className="flex gap-1.5 mt-2 flex-wrap">
                      {call.permissions.create && <KyBadge tone="blue">can create</KyBadge>}
                      {call.permissions.monitor && <KyBadge tone="gray">can monitor</KyBadge>}
                      {call.permissions.close ? <KyBadge tone="orange">can close</KyBadge> : <KyBadge tone="gray">close: Registrar only</KyBadge>}
                    </div>}
                    {status === 'closed' && call.closedReason && <p className="text-[11px] text-red-600 mt-1">Closure reason: {call.closedReason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {live && daysChip(call)}
                    {call.canEdit && <KyButton size="sm" variant="outline" icon={<Pencil size={14} />} disabled={acting !== null} onClick={() => setEditing(call)}>Edit</KyButton>}
                    {status === 'draft' && call.permissions.create && <KyButton size="sm" loading={acting === `publish:${call.id}`} disabled={acting !== null} onClick={() => void publishDraft(call)}>Publish</KyButton>}
                    {managesAll && live && <KyButton size="sm" variant="outline" disabled={acting !== null} onClick={() => setDelegating(call)}>Delegate</KyButton>}
                    {live && call.permissions.close && <KyButton size="sm" variant="danger" disabled={acting !== null} onClick={() => setClosing(call)}>Close</KyButton>}
                    {managesAll && status === 'closed' && <KyButton size="sm" disabled={acting !== null} onClick={() => setReopening(call)}>Reopen</KyButton>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && meta.total > 0 && <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <span>Page {meta.currentPage} of {meta.lastPage} · {meta.perPage} per page · {meta.total} calls</span>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <button className="px-3 py-1.5 rounded-lg border disabled:opacity-40" disabled={page >= meta.lastPage} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </div>}

      {creating && <CreateCallModal publishedProgrammes={options.programmes} onClose={() => setCreating(false)} onCreate={create} />}
      {editing && <CreateCallModal initialCall={editing} publishedProgrammes={options.programmes} onClose={() => setEditing(null)} onCreate={(input) => updateSelected(input)} />}
      <CloseCallDialog loading={Boolean(closing && acting === `close:${closing.id}`)} call={closing} onClose={() => setClosing(null)} onConfirm={closeSelected} />
      <ReopenCallDialog loading={Boolean(reopening && acting === `reopen:${reopening.id}`)} call={reopening} onClose={() => setReopening(null)} onConfirm={reopenSelected} />
      <DelegateDialog acting={acting} call={delegating} officers={options.officers} onClose={() => setDelegating(null)} onSave={delegate} />
    </div>
  );
}
