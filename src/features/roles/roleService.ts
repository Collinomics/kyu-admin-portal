import { apiFetch } from '../../services/api';
import type { UserRole } from '../users/types';

export type Capability = 'yes' | 'scoped' | 'no';

export interface MatrixRole {
  id: UserRole;
  label: string;
  short_label: string;
}

export interface CapabilityRow {
  id: string;
  name: string;
  roles: Record<string, Capability>;
}

export interface RoleMatrixResponse {
  roles: MatrixRole[];
  capabilities: CapabilityRow[];
  enforcement: 'server';
  editable: false;
}

export async function fetchRoleMatrix(): Promise<RoleMatrixResponse> {
  const response = await apiFetch('/api/v1/admin/role-matrix');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.message ?? 'The role policy could not be loaded.'));
  }
  return body.data as RoleMatrixResponse;
}
