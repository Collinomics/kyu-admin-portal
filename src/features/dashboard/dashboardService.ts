import { apiFetch } from '../../services/api';

export interface DashboardData {
  counts: {
    accounts: number;
    active_accounts: number;
    programmes: number;
    draft_programmes: number;
    published_programmes: number;
    pending_programmes: number;
    rejected_programmes: number;
    affiliated_institutions: number;
    open_calls: number;
    closing_soon_calls: number;
    draft_calls: number;
    closed_calls: number;
    assigned_calls: number;
  };
  monthly_activity: Array<{ month: string; value: number }>;
  focus_programmes: Array<{
    id: string;
    name: string;
    code: string;
    status: 'draft' | 'submitted' | 'hod-reviewed' | 'published' | 'rejected';
    faculty: string;
    department: string;
    coordinator: string;
  }>;
  focus_calls: Array<{ id: string; programme: string; intake: string; opening_date: string; deadline: string; status: 'draft' | 'open' | 'closed'; effective_status: 'draft' | 'scheduled' | 'open' | 'closing-soon' | 'closed' }>;
  recent_audit: Array<{ id: string; time: string; actor: string; action: string }>;
}

export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const response = await apiFetch('/api/v1/dashboard', { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Dashboard data could not be loaded.');
  return body.data as DashboardData;
}
