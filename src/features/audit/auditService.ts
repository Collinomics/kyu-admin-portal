import { apiFetch } from '../../services/api';

export type AuditCategory = 'account' | 'programme' | 'admissions' | 'security' | 'system';
export type AuditOutcome = 'success' | 'blocked' | 'warning';

export interface AuditEvent {
  id: string;
  createdAt: string;
  actor: string;
  actorEmail?: string;
  role: string;
  action: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  stats: { recorded: number; blocked: number; security: number };
}

interface RawEvent {
  id: string; created_at: string; actor: string; actor_email?: string | null; role: string;
  action: string; category: AuditCategory; outcome: AuditOutcome; target_type?: string | null;
  target_id?: string | null; ip_address?: string | null; request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function fetchAuditEvents(query: {
  page: number; search?: string; category?: AuditCategory | 'all'; outcome?: AuditOutcome | 'all';
  range?: '24h' | '7d' | '30d' | '90d' | 'all'; perPage?: number;
}): Promise<{ events: AuditEvent[]; meta: AuditMeta }> {
  const params = new URLSearchParams({ page: String(query.page), per_page: String(query.perPage ?? 10), range: query.range ?? '30d' });
  if (query.search) params.set('search', query.search);
  if (query.category && query.category !== 'all') params.set('category', query.category);
  if (query.outcome && query.outcome !== 'all') params.set('outcome', query.outcome);
  const response = await apiFetch(`/api/v1/admin/audit-events?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'The audit trail could not be loaded.'));
  }
  return {
    events: (body.data as RawEvent[]).map((event) => ({
      id: event.id, createdAt: event.created_at, actor: event.actor,
      actorEmail: event.actor_email ?? undefined, role: event.role, action: event.action,
      category: event.category, outcome: event.outcome, targetType: event.target_type ?? undefined,
      targetId: event.target_id ?? undefined, ipAddress: event.ip_address ?? undefined,
      requestId: event.request_id ?? undefined, metadata: event.metadata ?? undefined,
    })),
    meta: {
      currentPage: body.meta.current_page, lastPage: body.meta.last_page,
      perPage: body.meta.per_page, total: body.meta.total, stats: body.meta.stats,
    },
  };
}
