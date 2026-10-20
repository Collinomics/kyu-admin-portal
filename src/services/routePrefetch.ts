import { prefetchApi } from './api';

const resources: Array<[string, string[]]> = [
  ['/admin/dashboard', ['/api/v1/dashboard']],
  ['/admin/users', ['/api/v1/admin/users', '/api/v1/admin/users/options']],
  ['/admin/organisation', ['/api/v1/admin/organisation']],
  ['/admin/affiliates', ['/api/v1/admin/affiliated-institutions?page=1&per_page=20']],
  ['/admin/profile', ['/api/v1/auth/profile']],
  ['/admin/settings', ['/api/v1/admin/system-settings']],
  ['/admin/audit-log', ['/api/v1/admin/audit-events?page=1&per_page=10&range=30d']],
  ['/admin/roles', ['/api/v1/admin/role-matrix']],
];

export function prefetchAdminRoute(path: string): Promise<void> {
  const target = new URL(path, window.location.origin);
  let paths: string[] = [];
  if (target.pathname.startsWith('/admin/ai-monitor')) {
    void import('../features/ai-monitor/AiMonitorModule');
    if (target.pathname.endsWith('/events')) {
      paths = ['/api/v1/admin/ai-monitor?endpoint=events&range=30d&page=1&pageSize=15'];
    } else if (target.pathname.endsWith('/data-sources')) {
      paths = ['/api/v1/admin/knowledge-sources?per_page=50'];
    } else if (target.pathname.endsWith('/settings')) {
      paths = ['/api/v1/admin/ai-settings?endpoint=get', '/api/v1/admin/ai-settings?endpoint=activity'];
    } else {
      paths = ['/api/v1/admin/ai-monitor?endpoint=overview&range=7d', '/api/v1/admin/ai-monitor?endpoint=live'];
    }
  } else if (target.pathname === '/admin/programmes') {
    const params = new URLSearchParams({ page: '1', per_page: '10' });
    if (target.searchParams.get('search')) params.set('search', target.searchParams.get('search')!);
    if (target.searchParams.get('status')) params.set('status', target.searchParams.get('status')!);
    paths = [`/api/v1/programmes?${params}`, '/api/v1/programmes/options'];
  } else if (target.pathname === '/admin/admissions') {
    const params = new URLSearchParams({ page: '1', per_page: '10' });
    if (target.searchParams.get('search')) params.set('search', target.searchParams.get('search')!);
    if (target.searchParams.get('status')) params.set('status', target.searchParams.get('status')!);
    paths = [`/api/v1/application-calls?${params}`, '/api/v1/application-calls/options'];
  } else {
    paths = resources.find(([route]) => target.pathname.startsWith(route))?.[1] ?? [];
  }
  return Promise.all(paths.map((resource) => prefetchApi(resource))).then(() => undefined);
}
