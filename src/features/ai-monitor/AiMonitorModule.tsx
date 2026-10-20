import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Database, ScrollText, Settings2 } from 'lucide-react';
import { OverviewPage } from '../../../Monitor/src/pages/OverviewPage';
import { AuditLogPage } from '../../../Monitor/src/pages/AuditLogPage';
import { DocumentsPage } from '../../../Monitor/src/pages/DocumentsPage';
import { SettingsPage } from '../../../Monitor/src/pages/SettingsPage';
import { useAuth } from '../auth/AuthContext';
import MonitorSurface from './MonitorSurface';
import { prefetchAdminRoute } from '../../services/routePrefetch';

const tabs = [
  { label: 'Performance', path: '/admin/ai-monitor', end: true, icon: Activity },
  { label: 'AI Events', path: '/admin/ai-monitor/events', icon: ScrollText },
  { label: 'Data Sources', path: '/admin/ai-monitor/data-sources', icon: Database },
  { label: 'AI Settings', path: '/admin/ai-monitor/settings', icon: Settings2 },
];

export default function AiMonitorModule() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const warmTabs = async () => {
      for (const tab of tabs) {
        if (cancelled || tab.path === location.pathname) continue;
        await prefetchAdminRoute(tab.path);
      }
    };
    const timer = window.setTimeout(() => void warmTabs(), 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [location.pathname]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="px-1">
          <p className="text-sm font-extrabold text-slate-800">AI Navigation Monitor</p>
          <p className="text-xs text-slate-500">Performance, safety, knowledge sources and assistant controls</p>
        </div>
        <nav className="flex max-w-full gap-1 overflow-x-auto" aria-label="AI monitor sections">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              onMouseEnter={() => void prefetchAdminRoute(tab.path)}
              onFocus={() => void prefetchAdminRoute(tab.path)}
              onTouchStart={() => void prefetchAdminRoute(tab.path)}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive ? 'bg-kyu-blue text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <tab.icon size={15} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <MonitorSurface>
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="events" element={<AuditLogPage />} />
          <Route path="data-sources" element={<DocumentsPage />} />
          <Route path="settings" element={<SettingsPage actorName={user?.name} />} />
          <Route path="*" element={<Navigate to="/admin/ai-monitor" replace />} />
        </Routes>
      </MonitorSurface>
    </div>
  );
}
