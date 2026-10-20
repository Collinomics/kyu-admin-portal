import { apiFetch } from '../../services/api';
import type { ProgrammeProfile, ProgrammeStatus } from './types';
import type { UserManagementOptions } from '../users/types';

interface RawProgramme {
  id: string;
  name: string;
  code: string;
  category: ProgrammeProfile['category'];
  faculty_id?: string | null;
  faculty: string;
  department_id?: string | null;
  department: string;
  duration?: string | null;
  campus?: string | null;
  study_modes?: string[] | null;
  is_featured?: boolean;
  display_priority?: number;
  status: ProgrammeStatus;
  coordinator: string;
  updated_at: string;
  rejection_comment?: string | null;
  overview?: string;
  objective_impact?: string;
  philosophy_originality?: string;
  career_prospects?: string;
  admission_requirements?: string;
  structure_content?: string;
  version?: number;
  live_version?: number | null;
  reviews?: Array<{ id: string; version: number; action: string; comment?: string | null; actor: string; created_at: string }>;
}

export interface ProgrammePageMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  statusCounts: Partial<Record<ProgrammeStatus, number>>;
}

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  if (response.status === 204) return {};
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'The request could not be completed.'));
  }
  return body;
}

function mapProgramme(raw: RawProgramme): ProgrammeProfile {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    category: raw.category,
    facultyId: raw.faculty_id ?? undefined,
    faculty: raw.faculty,
    departmentId: raw.department_id ?? undefined,
    department: raw.department,
    duration: raw.duration ?? '',
    campus: raw.campus ?? '',
    studyModes: raw.study_modes ?? [],
    isFeatured: raw.is_featured ?? false,
    displayPriority: raw.display_priority ?? 0,
    status: raw.status,
    coordinator: raw.coordinator,
    updatedAt: raw.updated_at,
    rejectionComment: raw.rejection_comment ?? undefined,
    overview: raw.overview ?? '',
    objectiveImpact: raw.objective_impact ?? '',
    philosophyOriginality: raw.philosophy_originality ?? '',
    careerProspects: raw.career_prospects ?? '',
    admissionRequirements: raw.admission_requirements ?? '',
    structureContent: raw.structure_content ?? '',
    version: raw.version,
    liveVersion: raw.live_version ?? undefined,
    reviews: (raw.reviews ?? []).map((review) => ({
      id: review.id,
      version: review.version,
      action: review.action,
      comment: review.comment ?? undefined,
      actor: review.actor,
      createdAt: review.created_at,
    })),
  };
}

function payload(programme: ProgrammeProfile, intent: 'draft' | 'submit' | 'publish') {
  return {
    name: programme.name,
    code: programme.code,
    category: programme.category,
    faculty_id: programme.facultyId,
    department_id: programme.departmentId,
    duration: programme.duration,
    campus: programme.campus,
    study_modes: programme.studyModes,
    is_featured: programme.isFeatured,
    display_priority: programme.displayPriority,
    overview: programme.overview,
    objective_impact: programme.objectiveImpact,
    philosophy_originality: programme.philosophyOriginality,
    career_prospects: programme.careerProspects,
    admission_requirements: programme.admissionRequirements,
    structure_content: programme.structureContent,
    intent,
    expected_version: programme.version,
  };
}

export async function fetchProgrammes(query: { page: number; search?: string; status?: ProgrammeStatus | 'all'; perPage?: number }) {
  const params = new URLSearchParams({ page: String(query.page), per_page: String(query.perPage ?? 10) });
  if (query.search) params.set('search', query.search);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  const body = await jsonRequest(`/api/v1/programmes?${params}`);
  return {
    programmes: (body.data as RawProgramme[]).map(mapProgramme),
    meta: {
      currentPage: body.meta.current_page,
      lastPage: body.meta.last_page,
      perPage: body.meta.per_page,
      total: body.meta.total,
      statusCounts: body.meta.status_counts ?? {},
    } as ProgrammePageMeta,
  };
}

export async function fetchProgrammeOptions(): Promise<UserManagementOptions> {
  const body = await jsonRequest('/api/v1/programmes/options');
  return body.data as UserManagementOptions;
}

export async function saveProgramme(programme: ProgrammeProfile, intent: 'draft' | 'submit' | 'publish'): Promise<ProgrammeProfile> {
  const body = await jsonRequest(programme.id ? `/api/v1/programmes/${programme.id}` : '/api/v1/programmes', {
    method: programme.id ? 'PUT' : 'POST',
    body: JSON.stringify(payload(programme, intent)),
  });
  return mapProgramme(body.data as RawProgramme);
}

export async function runProgrammeAction(programme: ProgrammeProfile, action: 'submit' | 'forward' | 'publish' | 'unpublish' | 'reject' | 'recommend', comment?: string): Promise<ProgrammeProfile> {
  const body = await jsonRequest(`/api/v1/programmes/${programme.id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, comment, expected_version: programme.version, expected_status: programme.status }),
  });
  return mapProgramme(body.data as RawProgramme);
}

export async function deleteProgramme(id: string, currentPassword?: string): Promise<void> {
  await jsonRequest(`/api/v1/programmes/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ current_password: currentPassword }),
  });
}
