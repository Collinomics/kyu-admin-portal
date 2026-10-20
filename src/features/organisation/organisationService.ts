import { apiFetch } from '../../services/api';

export interface DepartmentUnit {
  id: string;
  faculty_id: string;
  code: string;
  name: string;
  is_active: boolean;
  programmes_count: number;
  active_assignments_count: number;
}

export interface FacultyUnit {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  programmes_count: number;
  active_assignments_count: number;
  departments: DepartmentUnit[];
}

export interface UnitInput {
  code: string;
  name: string;
  is_active?: boolean;
  current_password?: string;
}

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'The organisation request could not be completed.'));
  }
  return body;
}

export async function fetchOrganisation(): Promise<FacultyUnit[]> {
  const body = await request('/api/v1/admin/organisation');
  return body.data as FacultyUnit[];
}

export async function createFaculty(input: UnitInput): Promise<void> {
  await request('/api/v1/admin/organisation/faculties', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateFaculty(id: string, input: Required<Pick<UnitInput, 'code' | 'name' | 'is_active'>> & Pick<UnitInput, 'current_password'>): Promise<void> {
  await request(`/api/v1/admin/organisation/faculties/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function createDepartment(facultyId: string, input: UnitInput): Promise<void> {
  await request('/api/v1/admin/organisation/departments', { method: 'POST', body: JSON.stringify({ ...input, faculty_id: facultyId }) });
}

export async function updateDepartment(id: string, input: Required<Pick<UnitInput, 'code' | 'name' | 'is_active'>> & Pick<UnitInput, 'current_password'>): Promise<void> {
  await request(`/api/v1/admin/organisation/departments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
