import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Search, ScrollText, ShieldAlert } from 'lucide-react';
import { fetchAuditEvents, type AuditCategory, type AuditEvent, type AuditMeta, type AuditOutcome } from './auditService';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyBadge from '../../components/ui/KyBadge';
import KyButton from '../../components/ui/KyButton';
import KyStatCard from '../../components/ui/KyStatCard';
import KyEmpty from '../../components/ui/KyEmpty';
import { KySelect } from '../../components/ui/KyField';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchApi } from '../../services/api';

const EMPTY_META: AuditMeta = { currentPage: 1, lastPage: 1, perPage: 10, total: 0, stats: { recorded: 0, blocked: 0, security: 0 } };
const outcomeMeta = {
  success: { label: 'Success', tone: 'green' },
  blocked: { label: 'Blocked', tone: 'red' },
  warning: { label: 'Warning', tone: 'orange' },
} as const;
const categoryLabels: Record<AuditCategory, string> = {
  account: 'Accounts', programme: 'Programmes', admissions: 'Admissions', security: 'Security', system: 'System',
};
const roleLabels: Record<string, string> = {
  SYSADMIN: 'System Administrator', DEAN: 'Dean', HOD: 'Head of Department',
  COORDINATOR: 'Programme Coordinator', REGISTRAR: 'Academic Registrar',
  ADMISSIONS_OFFICER: 'Admissions Officer', SYSTEM: 'System',
};
const actionLabels: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.reauthenticated': 'Confirmed password for a protected action',
  'auth.login_failed': 'Failed sign-in attempt', 'user.created': 'Created a staff account',
  'user.status_changed': 'Changed an account status', 'user.password_reset_issued': 'Issued a password reset code',
  'programme.created': 'Created a programme profile', 'programme.updated': 'Updated a programme profile',
  'programme.submit': 'Submitted a programme for review', 'programme.submitted': 'Submitted a programme for review', 'programme.forward': 'Forwarded a programme to the Dean',
  'programme.publish': 'Published a programme', 'programme.published': 'Published a programme', 'programme.reject': 'Returned a programme with review comments', 'programme.rejected': 'Returned a programme with review comments',
  'programme.recommend': 'Recorded a programme recommendation', 'programme.deleted': 'Deleted a draft programme',
  'application_call.created': 'Created a draft application call', 'application_call.updated': 'Updated an application call', 'application_call.published': 'Published an application call',
  'application_call.closed': 'Closed an application call', 'application_call.auto_closed': 'Automatically closed an expired call',
  'application_call.delegated': 'Changed Admissions Officer permissions',
};

function eventTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [meta, setMeta] = useState<AuditMeta>(EMPTY_META);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | AuditCategory>('all');
  const [outcome, setOutcome] = useState<'all' | AuditOutcome>('all');
  const [range, setRange] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('30d');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshSignatureRef = useRef('');
  refreshSignatureRef.current = `${page}|${search}|${category}|${outcome}|${range}`;

  const load = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAuditEvents({ page: targetPage, search: search.trim(), category, outcome, range, perPage: 10 });
      setEvents(result.events);
      setMeta(result.meta);
      if (result.meta.currentPage !== targetPage) setPage(result.meta.currentPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The audit trail could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(page), search ? 300 : 0);
    return () => window.clearTimeout(timer);
    // Filters and pagination intentionally drive loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, category, outcome, range]);

  useBackgroundRefresh(async () => {
    const signature = `${page}|${search}|${category}|${outcome}|${range}`;
    const result = await fetchAuditEvents({ page, search: search.trim(), category, outcome, range, perPage: 10 });
    if (refreshSignatureRef.current !== signature) return;
    setEvents(result.events);
    setMeta(result.meta);
    setError('');
  }, 'operational');

  useEffect(() => {
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > meta.lastPage) continue;
      const params = new URLSearchParams({ page: String(targetPage), per_page: '10', range });
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'all') params.set('category', category);
      if (outcome !== 'all') params.set('outcome', outcome);
      void prefetchApi(`/api/v1/admin/audit-events?${params}`);
    }
  }, [page, meta.lastPage, search, category, outcome, range]);

  return (
    <div className="space-y-6">
      <KyPageHeader title="Audit Log" subtitle="Append-only security and operational events" />

      <p className="text-[11px] text-gray-500 bg-kyu-blue/5 border border-kyu-blue/20 rounded-lg px-3 py-2">
        Entries use East Africa Time for display and UTC in storage. No portal role, including the System Administrator, can edit or delete them.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KyStatCard label="Recorded events" value={meta.stats.recorded} hint={`within ${range === 'all' ? 'all time' : range}`} icon={ScrollText} tone="text-kyu-blue bg-kyu-blue/10" />
        <KyStatCard label="Blocked / failed" value={meta.stats.blocked} hint="failed authentication attempts" icon={ShieldAlert} tone="text-red-600 bg-red-100" />
        <KyStatCard label="Security events" value={meta.stats.security} hint="sign-ins, sign-outs and failures" icon={Activity} tone="text-kyu-orange-dark bg-kyu-orange/20" />
      </div>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="audit-filter-grid p-4 border-b border-gray-200 bg-slate-50 gap-3 items-end">
        <div className="min-w-0">
          <label htmlFor="audit-search" className="block text-sm font-semibold text-gray-700 mb-1">Search</label>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="audit-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Actor, email, action, IP or request ID..." className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm" />
          </div>
        </div>
        <div className="min-w-0">
          <KySelect label="Category" value={category} className="bg-white" onChange={(event) => { setCategory(event.target.value as typeof category); setPage(1); }}>
            <option value="all">All categories</option>
            {(Object.keys(categoryLabels) as AuditCategory[]).map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}
          </KySelect>
        </div>
        <div className="min-w-0">
          <KySelect label="Outcome" value={outcome} className="bg-white" onChange={(event) => { setOutcome(event.target.value as typeof outcome); setPage(1); }}>
            <option value="all">All outcomes</option><option value="success">Success</option><option value="blocked">Blocked</option><option value="warning">Warning</option>
          </KySelect>
        </div>
        <div className="min-w-0">
          <KySelect label="Date range" value={range} className="bg-white" onChange={(event) => { setRange(event.target.value as typeof range); setPage(1); }}>
            <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option>
          </KySelect>
        </div>
      </div>

      {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 flex justify-between gap-3"><p className="text-sm text-red-700">{error}</p><KyButton size="sm" variant="outline" onClick={() => void load(page)}>Try Again</KyButton></div>}

      {loading ? (
        <div className="p-12 text-center text-sm text-gray-500">Loading protected audit records…</div>
      ) : events.length === 0 ? (
        <KyEmpty title="No events match" hint="Adjust the search, date range or filters." />
      ) : (
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-kyu-blue text-white"><tr><th className="px-4 py-3 font-semibold">Time (EAT)</th><th className="px-4 py-3 font-semibold">Actor</th><th className="px-4 py-3 font-semibold">Action</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Outcome</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => <tr key={event.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">{eventTime(event.createdAt)}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-gray-800 text-xs">{event.actor}</p><p className="text-[11px] text-gray-400">{event.actorEmail ?? roleLabels[event.role] ?? event.role}</p></td>
                  <td className="px-4 py-3 text-gray-600 min-w-64"><p>{actionLabels[event.action] ?? event.action.replaceAll('.', ' ')}</p><p className="text-[10px] text-gray-400 font-mono mt-1">{event.targetType && `${event.targetType} · `}{event.targetId ?? event.ipAddress ?? event.requestId}</p></td>
                  <td className="px-4 py-3"><KyBadge tone="blue">{categoryLabels[event.category]}</KyBadge></td>
                  <td className="px-4 py-3"><KyBadge tone={outcomeMeta[event.outcome].tone}>{outcomeMeta[event.outcome].label}</KyBadge></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
            <span>Page {meta.currentPage} of {meta.lastPage} · {meta.perPage} per page · {meta.total} matching events</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1.5 rounded-lg border disabled:opacity-40">First</button>
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={14} /></button>
              <button disabled={page >= meta.lastPage} onClick={() => setPage((value) => value + 1)} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={14} /></button>
              <button disabled={page >= meta.lastPage} onClick={() => setPage(meta.lastPage)} className="px-2 py-1.5 rounded-lg border disabled:opacity-40">Last</button>
            </div>
          </div>
        </div>
      )}
      </section>
    </div>
  );
}
