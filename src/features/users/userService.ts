import { apiFetch } from '../../services/api';
import type {
  AddAssignmentsInput,
  CreateUserInput,
  OnboardingInvitation,
  OfficerPermissions,
  UserAccount,
  UserManagementOptions,
  UserRole,
  UserStatus,
} from './types';

interface RawAssignment {
  faculty_id?: string | null;
  faculty?: string | null;
  department_id?: string | null;
  department?: string | null;
  programme_id?: string | null;
  programme?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  instructions?: string | null;
  prior_review?: boolean;
  is_effective?: boolean;
  call_label?: string | null;
  application_call_id?: string | null;
  permissions?: Partial<OfficerPermissions>;
}

interface RawUser {
  id: string;
  title?: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  staff_status?: UserAccount['staffStatus'];
  created_at?: string;
  created_by?: string;
  assignment?: RawAssignment | null;
  assignments?: RawAssignment[];
  can_delete?: boolean;
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

function unitFor(raw: RawUser): string {
  const assignment = raw.assignment;
  const assignments = raw.assignments?.length ? raw.assignments : (assignment ? [assignment] : []);
  if (raw.role === 'DEAN') return assignment?.faculty ?? 'Faculty not assigned';
  if (raw.role === 'HOD') return [assignment?.faculty, assignment?.department].filter(Boolean).join(' — ') || 'Department not assigned';
  if (raw.role === 'COORDINATOR') return assignments.map((item) => item.programme).filter(Boolean).join(' · ') || 'Programme not assigned';
  if (raw.role === 'ADMISSIONS_OFFICER') return assignments.map((item) => item.call_label).filter(Boolean).join(' · ') || 'Call not assigned';
  if (raw.role === 'SYSADMIN') return 'University-wide administration';
  return 'Admissions Division';
}

function mapUser(raw: RawUser): UserAccount {
  const assignment = raw.assignment;
  const assignments = raw.assignments?.length ? raw.assignments : (assignment ? [assignment] : []);
  return {
    id: raw.id,
    title: raw.title ?? '',
    firstName: raw.first_name,
    lastName: raw.last_name,
    email: raw.email,
    role: raw.role,
    unit: unitFor(raw),
    status: raw.status,
    createdBy: raw.created_by ?? 'System bootstrap',
    createdAt: raw.created_at ?? '',
    canDelete: Boolean(raw.can_delete),
    facultyId: assignment?.faculty_id ?? undefined,
    faculty: assignment?.faculty ?? undefined,
    departmentId: assignment?.department_id ?? undefined,
    department: assignment?.department ?? undefined,
    staffStatus: raw.staff_status ?? undefined,
    programmeId: assignment?.programme_id ?? undefined,
    programme: assignment?.programme ?? undefined,
    programmeIds: assignments.map((item) => item.programme_id).filter((id): id is string => Boolean(id)),
    programmes: assignments.map((item) => item.programme).filter((name): name is string => Boolean(name)),
    assignmentStart: assignment?.starts_on ?? undefined,
    assignmentEnd: assignment?.ends_on ?? undefined,
    instructions: assignment?.instructions ?? undefined,
    priorReview: assignment?.prior_review,
    assignmentEffective: assignment?.is_effective,
    call: assignment?.call_label ?? undefined,
    callId: assignment?.application_call_id ?? undefined,
    callIds: assignments.map((item) => item.application_call_id).filter((id): id is string => Boolean(id)),
    calls: assignments.map((item) => item.call_label).filter((name): name is string => Boolean(name)),
    permissions: assignment?.permissions as OfficerPermissions | undefined,
  };
}

export async function fetchUsers(): Promise<UserAccount[]> {
  const body = await jsonRequest('/api/v1/admin/users');
  return (body.data as RawUser[]).map(mapUser);
}

export async function fetchUserOptions(): Promise<UserManagementOptions> {
  const body = await jsonRequest('/api/v1/admin/users/options');
  return body.data as UserManagementOptions;
}

export async function createUser(input: CreateUserInput): Promise<{ user: UserAccount; invitation: OnboardingInvitation }> {
  const body = await jsonRequest('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      role: input.role,
      faculty_id: input.facultyId,
      department_id: input.departmentId,
      staff_status: input.staffStatus,
      programme_id: input.programmeId,
      programme_ids: input.programmeIds,
      starts_on: input.assignmentStart,
      ends_on: input.assignmentEnd,
      instructions: input.instructions,
      prior_review: input.priorReview,
      call_label: input.call,
      application_call_id: input.callId,
      application_call_ids: input.callIds,
      permissions: input.permissions,
    }),
  });
  return {
    user: mapUser(body.data as RawUser),
    invitation: {
      kind: 'onboarding',
      url: body.onboarding.url,
      expiresIn: body.onboarding.expires_in,
      developmentOtp: body.onboarding.development_otp,
    },
  };
}

export async function changeUserStatus(id: string, status: UserStatus, currentPassword?: string): Promise<UserAccount> {
  const body = await jsonRequest(`/api/v1/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, current_password: currentPassword }),
  });
  return mapUser(body.data as RawUser);
}

export async function issuePasswordReset(id: string): Promise<OnboardingInvitation> {
  const body = await jsonRequest(`/api/v1/admin/users/${id}/reset-password`, { method: 'POST' });
  return {
    kind: body.delivery.kind,
    url: body.delivery.url,
    expiresIn: body.delivery.expires_in,
    developmentOtp: body.delivery.development_otp,
  };
}

export async function addUserAssignments(id: string, input: AddAssignmentsInput): Promise<UserAccount> {
  const body = await jsonRequest(`/api/v1/admin/users/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify({
      programme_ids: input.programmeIds,
      application_call_ids: input.callIds,
      starts_on: input.assignmentStart,
      ends_on: input.assignmentEnd,
      instructions: input.instructions,
      prior_review: input.priorReview,
      permissions: input.permissions,
    }),
  });
  return mapUser(body.data as RawUser);
}

export async function deleteUserAccount(id: string, currentPassword: string): Promise<void> {
  await jsonRequest(`/api/v1/admin/users/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ current_password: currentPassword }),
  });
}
