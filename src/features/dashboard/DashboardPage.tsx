import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, BookOpen, GraduationCap, Activity, UserPlus, Settings2,
  Plus, Megaphone, Inbox, CheckCircle2, AlertCircle, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { UserRole } from '../users/types';
import { statusMeta } from '../programmes/types';
import { daysLeft } from '../admissions/types';
import StatCard from './components/StatCard';
import ActivityChart from './components/ActivityChart';
import AuditFeed from './components/AuditFeed';
import KyBadge from '../../components/ui/KyBadge';
import type { BadgeTone } from '../../components/ui/KyBadge';
import KyButton from '../../components/ui/KyButton';
import { fetchDashboard, type DashboardData } from './dashboardService';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchAdminRoute } from '../../services/routePrefetch';

interface Stat { label: string; value: string | number; hint: string; icon: LucideIcon; tone: string; to: string; }
interface Row { left: string; sub?: string; badge: string; tone: BadgeTone; to?: string; }
interface Action { label: string; icon: LucideIcon; variant: 'accent' | 'primary' | 'outline'; to?: string; onClick?: () => void; }
type FocusCall = DashboardData['focus_calls'][number];

function callDashboardBadge(call: FocusCall): string {
  if (call.effective_status === 'draft') return 'Draft';
  if (call.effective_status === 'scheduled') return `Opens ${call.opening_date}`;
  if (call.effective_status === 'closed') return 'Closed';
  return `${Math.max(0, daysLeft(call.deadline))} days left`;
}

function callDashboardTone(call: FocusCall): BadgeTone {
  if (call.effective_status === 'draft') return 'gray';
  if (call.effective_status === 'scheduled') return 'blue';
  if (call.effective_status === 'closed') return 'red';
  return call.effective_status === 'closing-soon' ? 'orange' : 'green';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role: UserRole = user?.role ?? 'SYSADMIN';
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setDashboardLoading(true);
    fetchDashboard(controller.signal)
      .then((data) => { setDashboard(data); setDashboardError(''); })
      .catch((error) => {
        if (!controller.signal.aborted) setDashboardError(error instanceof Error ? error.message : 'Dashboard data could not be loaded.');
      })
      .finally(() => { if (!controller.signal.aborted) setDashboardLoading(false); });
    return () => controller.abort();
  }, []);

  useBackgroundRefresh(async () => {
    const data = await fetchDashboard();
    setDashboard(data);
    setDashboardError('');
  }, 'operational');

  // Derived data
  const counts = dashboard?.counts;
  const focusProgrammes = dashboard?.focus_programmes ?? [];
  const publishedCount = counts?.published_programmes ?? 0;
  const focusCalls = dashboard?.focus_calls ?? [];

  let subtitle = 'Here is what is happening across the Kyambogo PCS engine today.';
  let stats: Stat[] = [];
  let actions: Action[] = [];
  let panelTitle = '';
  let rows: Row[] = [];
  let showAudit = false;

  if (role === 'SYSADMIN') {
    showAudit = true;
    stats = [
      { label: 'Total Accounts', value: counts?.accounts ?? '—', hint: `${counts?.active_accounts ?? 0} active`, icon: Users, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/users' },
      { label: 'Published Programmes', value: dashboardLoading ? '—' : publishedCount, hint: `${counts?.pending_programmes ?? 0} pending review`, icon: BookOpen, tone: 'text-kyu-orange-dark bg-kyu-orange/20', to: '/admin/programmes?status=published' },
      { label: 'Open Calls', value: counts?.open_calls ?? 0, hint: 'Admissions connection pending', icon: GraduationCap, tone: 'text-green-600 bg-green-100', to: '/admin/admissions?status=open' },
      { label: 'Published Affiliates', value: counts?.affiliated_institutions ?? '—', hint: 'available to the AI catalogue', icon: Activity, tone: 'text-teal-600 bg-teal-100', to: '/admin/affiliates' },
    ];
    actions = [
      { label: 'Create Account', icon: UserPlus, variant: 'accent', to: '/admin/users' },
      { label: 'System Settings', icon: Settings2, variant: 'outline', to: '/admin/settings' },
    ];
  }

  if (role === 'DEAN') {
    subtitle = 'Your faculty at a glance — and the decisions waiting on you.';
    const queue = focusProgrammes.filter((p) => p.status === 'hod-reviewed');
    stats = [
      { label: 'Faculty Programmes', value: counts?.programmes ?? '—', hint: 'within your assignment', icon: BookOpen, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/programmes' },
      { label: 'Awaiting Your Decision', value: queue.length, hint: 'forwarded by HODs', icon: Inbox, tone: 'text-kyu-orange-dark bg-kyu-orange/20', to: '/admin/programmes?status=hod-reviewed' },
      { label: 'Published Live', value: counts?.published_programmes ?? '—', hint: 'in the catalogue', icon: CheckCircle2, tone: 'text-green-600 bg-green-100', to: '/admin/programmes?status=published' },
      { label: 'HOD Accounts', value: counts?.accounts ?? '—', hint: 'created under your account', icon: Users, tone: 'text-teal-600 bg-teal-100', to: '/admin/users?role=HOD' },
    ];
    actions = [{ label: 'Create HOD Account', icon: UserPlus, variant: 'accent', to: '/admin/users' }];
    panelTitle = 'Awaiting your decision';
    rows = queue.map((p) => ({ left: p.name, sub: p.department, badge: statusMeta[p.status].label, tone: statusMeta[p.status].tone, to: `/admin/programmes?search=${encodeURIComponent(p.code)}&target=${p.id}` }));
  }

  if (role === 'HOD') {
    subtitle = 'Your faculty or school pipeline — review what your coordinators submitted.';
    const queue = focusProgrammes.filter((p) => p.status === 'submitted');
    stats = [
      { label: 'My Coordinators', value: counts?.accounts ?? '—', hint: 'created under your account', icon: Users, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/users?role=COORDINATOR' },
      { label: 'Awaiting Review', value: queue.length, hint: 'submitted drafts', icon: Inbox, tone: 'text-kyu-orange-dark bg-kyu-orange/20', to: '/admin/programmes?status=submitted' },
      { label: 'Published In Unit', value: counts?.published_programmes ?? '—', hint: 'across your faculty or school', icon: CheckCircle2, tone: 'text-green-600 bg-green-100', to: '/admin/programmes?status=published' },
      { label: 'Returned For Fixes', value: counts?.rejected_programmes ?? '—', hint: 'with review comments', icon: AlertCircle, tone: 'text-red-600 bg-red-100', to: '/admin/programmes?status=rejected' },
    ];
    actions = [{ label: 'Create Coordinator', icon: UserPlus, variant: 'accent', to: '/admin/users' }];
    panelTitle = 'Review queue';
    rows = queue.map((p) => ({ left: p.name, sub: p.coordinator, badge: statusMeta[p.status].label, tone: statusMeta[p.status].tone, to: `/admin/programmes?search=${encodeURIComponent(p.code)}&target=${p.id}` }));
  }

  if (role === 'COORDINATOR') {
    subtitle = 'Your programmes and where each one stands in the pipeline.';
    stats = [
      { label: 'My Programmes', value: counts?.programmes ?? '—', hint: 'assigned to you', icon: BookOpen, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/programmes' },
      { label: 'Drafts', value: counts?.draft_programmes ?? '—', hint: 'not yet submitted', icon: Eye, tone: 'text-gray-500 bg-gray-200', to: '/admin/programmes?status=draft' },
      { label: 'Published', value: counts?.published_programmes ?? '—', hint: 'live in catalogue', icon: CheckCircle2, tone: 'text-green-600 bg-green-100', to: '/admin/programmes?status=published' },
      { label: 'Needs Fixes', value: counts?.rejected_programmes ?? '—', hint: 'reviewer comments attached', icon: AlertCircle, tone: 'text-red-600 bg-red-100', to: '/admin/programmes?status=rejected' },
    ];
    actions = [{ label: 'Open My Programmes', icon: BookOpen, variant: 'accent', to: '/admin/programmes' }];
    panelTitle = 'My pipeline';
    rows = focusProgrammes.map((p) => ({ left: p.name, badge: statusMeta[p.status].label, tone: statusMeta[p.status].tone, to: `/admin/programmes?search=${encodeURIComponent(p.code)}&target=${p.id}` }));
  }

  if (role === 'REGISTRAR') {
    subtitle = 'The application windows you control — watch the deadlines.';
    stats = [
      { label: 'Open Calls', value: counts?.open_calls ?? '—', hint: 'Apply Now is live', icon: Megaphone, tone: 'text-green-600 bg-green-100', to: '/admin/admissions?status=open' },
      { label: 'Closing Soon', value: counts?.closing_soon_calls ?? '—', hint: 'within the configured threshold', icon: GraduationCap, tone: 'text-kyu-orange-dark bg-kyu-orange/20', to: '/admin/admissions?status=closing-soon' },
      { label: 'Officers Created', value: counts?.accounts ?? '—', hint: 'under your account', icon: Users, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/users?role=ADMISSIONS_OFFICER' },
      { label: 'Closed', value: counts?.closed_calls ?? '—', hint: 'auto or manual', icon: CheckCircle2, tone: 'text-gray-500 bg-gray-200', to: '/admin/admissions?status=closed' },
    ];
    actions = [{ label: 'New Call', icon: Plus, variant: 'accent', to: '/admin/admissions' }];
    panelTitle = 'Calls watch';
    rows = focusCalls.map((c) => ({ left: c.programme, sub: c.intake, badge: callDashboardBadge(c), tone: callDashboardTone(c), to: `/admin/admissions?search=${encodeURIComponent(c.intake)}&target=${c.id}` }));
  }

  if (role === 'ADMISSIONS_OFFICER') {
    subtitle = 'Your assigned calls and exactly what you may do on each.';
    stats = [
      { label: 'Assigned Calls', value: counts?.assigned_calls ?? '—', hint: 'scoped to you', icon: Megaphone, tone: 'text-kyu-blue bg-kyu-blue/10', to: '/admin/admissions' },
      { label: 'Closing Soon', value: counts?.closing_soon_calls ?? '—', hint: 'act before deadline', icon: GraduationCap, tone: 'text-kyu-orange-dark bg-kyu-orange/20', to: '/admin/admissions?status=closing-soon' },
      { label: 'Open Calls', value: counts?.open_calls ?? '—', hint: 'within your assignment', icon: CheckCircle2, tone: 'text-green-600 bg-green-100', to: '/admin/admissions?status=open' },
      { label: 'Draft Calls', value: counts?.draft_calls ?? '—', hint: 'within your assignment', icon: Plus, tone: 'text-teal-600 bg-teal-100', to: '/admin/admissions?status=draft' },
    ];
    actions = [{ label: 'View My Calls', icon: Eye, variant: 'outline', to: '/admin/admissions' }];
    panelTitle = 'Your assigned calls';
    rows = focusCalls.map((call) => ({
      left: call.programme, sub: call.intake,
      badge: callDashboardBadge(call),
      tone: callDashboardTone(call),
      to: `/admin/admissions?search=${encodeURIComponent(call.intake)}&target=${call.id}`,
    }));
  }

  return (
    <div className="space-y-5">
      {dashboardError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dashboardError}</div>}
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-kyu-blue to-kyu-blue-light text-white p-5 md:p-6">
        <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-kyu-orange/20" />
        <div className="absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-white/10" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold">Welcome back, {user?.name.split(' ')[0]}</h1>
            <p className="text-sm text-blue-100 mt-1">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {actions.map((a) => (
              <KyButton key={a.label} variant={a.variant} icon={<a.icon size={16} />} onClick={a.onClick ?? (() => a.to && navigate(a.to))}>
                {a.label}
              </KyButton>
            ))}
          </div>
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} icon={s.icon} tone={s.tone} onIntent={() => void prefetchAdminRoute(s.to)} onClick={() => navigate(s.to)} />
        ))}
      </div>

      {/* Chart + role focus panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2"><ActivityChart data={dashboard?.monthly_activity ?? []} loading={dashboardLoading} /></div>
        {showAudit ? (
          <AuditFeed events={dashboard?.recent_audit ?? []} loading={dashboardLoading} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">{panelTitle}</h3>
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">Nothing waiting on you right now.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <li key={i} className={`px-4 py-3 flex items-center gap-3 ${r.to ? 'cursor-pointer transition hover:bg-blue-50 focus-within:bg-blue-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      {r.to ? <button type="button" onClick={() => navigate(r.to!)} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-kyu-blue rounded">
                        <span className="block text-sm font-semibold text-gray-800 truncate">{r.left}</span>
                        {r.sub && <span className="block text-[11px] text-gray-400 truncate">{r.sub}</span>}
                      </button> : <>
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.left}</p>
                        {r.sub && <p className="text-[11px] text-gray-400 truncate">{r.sub}</p>}
                      </>}
                    </div>
                    <KyBadge tone={r.tone}>{r.badge}</KyBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
