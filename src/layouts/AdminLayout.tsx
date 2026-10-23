import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { roleLabels } from '../features/users/types';
import { UNIVERSITY } from '../utils/university';
import { navSections } from '../routes/navigation';
import SessionGuard from '../components/SessionGuard';
import GlobalSearch from '../components/GlobalSearch';
import NotificationBell from '../components/NotificationBell';
import kyuLogo from '../../support/kyu_logo.png';
import { fetchRuntimeSettings, type RuntimeSettings } from '../features/settings/settingsService';
import { BackgroundRefreshProvider, type BackgroundRefreshPolicy } from '../hooks/useBackgroundRefresh';
import { prefetchAdminRoute } from '../services/routePrefetch';
import ProfileAvatar from '../components/ProfileAvatar';
import HeaderClock from '../components/HeaderClock';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [refreshPolicy, setRefreshPolicy] = useState<BackgroundRefreshPolicy>({ enabled: true, operationalSeconds: 10, standardSeconds: 15 });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => { await logout(); navigate('/login'); };

    // Keep wheel scrolling inside the sidebar while the pointer is over it
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const aside = asideRef.current;
    const nav = navRef.current;
    if (!aside || !nav) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // keep browser zoom working
      e.preventDefault();
      nav.scrollTop += e.deltaY;
    };
    aside.addEventListener('wheel', onWheel, { passive: false });
    return () => aside.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const applySettings = (settings: RuntimeSettings) => {
      setSessionTimeoutMinutes(settings.sessionTimeoutMinutes);
      setRefreshPolicy({
        enabled: settings.backgroundRefreshEnabled,
        operationalSeconds: settings.operationalRefreshSeconds,
        standardSeconds: settings.adminRefreshSeconds,
      });
    };
    fetchRuntimeSettings().then(applySettings).catch(() => undefined);
    const update = (event: Event) => applySettings((event as CustomEvent<RuntimeSettings>).detail);
    window.addEventListener('kyu:runtime-settings-updated', update);
    return () => window.removeEventListener('kyu:runtime-settings-updated', update);
  }, []);

  // Only show items this role may see
  const visibleSections = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => user && i.roles.includes(user.role)) }))
    .filter((s) => s.items.length > 0);

  useEffect(() => {
    if (!user || document.hidden || !navigator.onLine) return;
    const paths = visibleSections.flatMap((section) => section.items.map((item) => item.path));
    const pendingPaths = [...new Set(paths)].filter((path) => path !== location.pathname);
    let cancelled = false;
    let timer = 0;
    const pause = (milliseconds: number) => new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, milliseconds);
    });
    const warmAccessiblePages = async () => {
      await pause(1_500);
      for (const path of pendingPaths) {
        if (cancelled) return;
        if (document.hidden || !navigator.onLine) {
          await pause(3_000);
          continue;
        }
        await prefetchAdminRoute(path);
        await pause(350);
      }
    };
    void warmAccessiblePages();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Re-warm only accessible destinations after navigation; cached requests are deduplicated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, location.pathname]);

  return (
    <BackgroundRefreshProvider policy={refreshPolicy}><div className="admin-shell min-h-screen bg-slate-100">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ============ SIDEBAR ============ */}
      <aside
        ref={asideRef}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#0B1F3A] text-slate-300 transition-all duration-300 
        ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'}`}
      >
        <div className="flex items-center gap-3 h-16 px-4 border-b border-white/10">
          <img src={kyuLogo} alt="KYU crest" className="h-10 w-10 shrink-0 object-contain" />
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="font-extrabold text-white leading-tight">KYU PCS</p>
              <p className="text-[10px] text-slate-400 italic truncate">{UNIVERSITY.motto}</p>
            </div>
          )}
          <button className="ml-auto md:hidden p-2 rounded-lg hover:bg-white/10" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav ref={navRef} className="ky-sidebar-scroll flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {visibleSections.map((section) => (
            <div key={section.label}>
              {sidebarOpen && (
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{section.label}</p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.name}>
                    <NavLink
                      to={item.path}
                      onMouseEnter={() => void prefetchAdminRoute(item.path)}
                      onFocus={() => void prefetchAdminRoute(item.path)}
                      onTouchStart={() => void prefetchAdminRoute(item.path)}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isActive ? 'bg-kyu-blue text-white font-semibold' : 'hover:bg-white/5 hover:text-white'
                        }`}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={18} className={isActive ? 'text-kyu-orange' : 'text-slate-400 group-hover:text-slate-200'} />
                          {sidebarOpen && <span className="truncate">{item.name}</span>}
                          {sidebarOpen && isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-kyu-orange" />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-kyu-blue-dark/70 border border-white/10">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <p className="text-[11px] font-bold font-mono text-green-300">SECURE SESSION</p>
            </div>
            <p className="mt-1 text-[10px] font-mono text-blue-200">Authenticated access</p>
          </div>
        )}

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
            <button type="button" onClick={() => navigate('/admin/profile')} aria-label="Open my account"><ProfileAvatar user={user} /></button>
            {sidebarOpen && (
              <>
                <button type="button" onClick={() => navigate('/admin/profile')} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user ? roleLabels[user.role] : ''}</p>
                  {user?.faculty && <p className="text-[9px] text-slate-500 truncate" title={user.faculty}>{user.faculty}</p>}
                </button>
                <button onClick={handleLogout} title="Logout" className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10">
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}`}>
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center gap-2 md:gap-3 px-3 md:px-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0">
            <Menu size={20} />
          </button>

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-1 md:gap-1.5 shrink-0">
            <span className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[11px] font-semibold text-green-700">
              <ShieldCheck size={13} /> Authenticated
            </span>
            <a
              href={UNIVERSITY.applicationPortal}
              target="_blank"
              rel="noreferrer"
              title="Open public application portal"
              className="hidden md:block p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <ExternalLink size={18} />
            </a>
            <NotificationBell />
            <HeaderClock />
            <div className="flex items-center gap-2 md:gap-3 pl-1">
              <button type="button" onClick={() => navigate('/admin/profile')} aria-label="Open my account"><ProfileAvatar user={user} /></button>
              <button type="button" onClick={() => navigate('/admin/profile')} className="hidden md:block text-left text-sm">
                <p className="font-semibold text-gray-800 leading-tight">{user?.name}</p>
                <p className="max-w-56 truncate text-xs text-gray-500" title={user?.faculty ? `${roleLabels[user.role]} · ${user.faculty}` : undefined}>{user ? roleLabels[user.role] : ''}{user?.faculty ? ` · ${user.faculty}` : ''}</p>
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <div key={location.pathname} className="ky-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <SessionGuard minutes={sessionTimeoutMinutes} />
    </div></BackgroundRefreshProvider>
  );
}
