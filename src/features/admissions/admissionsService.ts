import { apiFetch } from '../../services/api';
import type { ApplicationCall, ApplicationCallInput, CallPermissions, CallStatus, EffectiveCallStatus } from './types';

interface RawCall {
  id: string; programme_id: string; programme: string; intake: string;
  opening_date: string; deadline: string; requirements: string; status: CallStatus;
  effective_status: EffectiveCallStatus; closed_reason?: string | null; created_by: string;
  can_edit: boolean;
  permissions: CallPermissions;
  assignments: Array<{ officer_id: string; officer: string; permissions: CallPermissions }>;
}

export interface AdmissionsOptions {
  programmes: Array<{ id: string; name: string; code: string }>;
  officers: Array<{ id: string; title?: string; first_name: string; last_name: string; email: string }>;
  capabilities: { can_create: boolean };
  closing_soon_days: number;
}

export interface CallsMeta {
  currentPage: number; lastPage: number; perPage: number; total: number;
  statusCounts: Partial<Record<CallStatus, number>>;
}

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'The request could not be completed.'));
  }
  return body;
}

function mapCall(raw: RawCall): ApplicationCall {
  return {
    id: raw.id, programmeId: raw.programme_id, programme: raw.programme, intake: raw.intake,
    openingDate: raw.opening_date, deadline: raw.deadline, requirements: raw.requirements,
    status: raw.status, effectiveStatus: raw.effective_status,
    closedReason: raw.closed_reason ?? undefined, createdBy: raw.created_by,
    permissions: raw.permissions,
    canEdit: raw.can_edit,
    assignments: raw.assignments.map((assignment) => ({
      officerId: assignment.officer_id, officer: assignment.officer, permissions: assignment.permissions,
    })),
  };
}

export async function fetchCalls(page = 1, perPage = 10, search = '', status = 'all') {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (search.trim()) params.set('search', search.trim());
  if (status !== 'all') params.set('status', status);
  const body = await jsonRequest(`/api/v1/application-calls?${params.toString()}`);
  return {
    calls: (body.data as RawCall[]).map(mapCall),
    meta: {
      currentPage: body.meta.current_page, lastPage: body.meta.last_page,
      perPage: body.meta.per_page, total: body.meta.total, statusCounts: body.meta.status_counts ?? {},
    } as CallsMeta,
  };
}

export async function fetchAdmissionsOptions(): Promise<AdmissionsOptions> {
  const body = await jsonRequest('/api/v1/application-calls/options');
  return body.data as AdmissionsOptions;
}

export async function createCall(input: ApplicationCallInput, publish: boolean): Promise<ApplicationCall> {
  const body = await jsonRequest('/api/v1/application-calls', {
    method: 'POST',
    body: JSON.stringify({
      programme_id: input.programmeId, intake: input.intake, opening_date: input.openingDate,
      deadline: input.deadline, requirements: input.requirements, publish,
    }),
  });
  return mapCall(body.data as RawCall);
}

export async function updateCall(id: string, input: ApplicationCallInput): Promise<ApplicationCall> {
  const body = await jsonRequest(`/api/v1/application-calls/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      programme_id: input.programmeId, intake: input.intake, opening_date: input.openingDate,
      deadline: input.deadline, requirements: input.requirements,
    }),
  });
  return mapCall(body.data as RawCall);
}

export async function publishCall(id: string): Promise<ApplicationCall> {
  const body = await jsonRequest(`/api/v1/application-calls/${id}/publish`, { method: 'POST' });
  return mapCall(body.data as RawCall);
}

export async function closeCall(id: string, reason: string): Promise<ApplicationCall> {
  const body = await jsonRequest(`/api/v1/application-calls/${id}/close`, { method: 'POST', body: JSON.stringify({ reason }) });
  return mapCall(body.data as RawCall);
}

export async function reopenCall(id: string, input: { openingDate: string; deadline: string; reason: string }): Promise<ApplicationCall> {
  const body = await jsonRequest(`/api/v1/application-calls/${id}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ opening_date: input.openingDate, deadline: input.deadline, reason: input.reason }),
  });
  return mapCall(body.data as RawCall);
}

export async function delegateCall(id: string, officerId: string, permissions: CallPermissions): Promise<ApplicationCall> {
  const body = await jsonRequest(`/api/v1/application-calls/${id}/delegate`, {
    method: 'PUT', body: JSON.stringify({ officer_id: officerId, permissions }),
  });
  return mapCall(body.data as RawCall);
}
