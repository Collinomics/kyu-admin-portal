import type { UserRole } from './types';

// Delegation model: the System Administrator can create all managed roles.
// This single map drives the role cards in the Create Account modal.
export const creatableRoles: Record<UserRole, UserRole[]> = {
  SYSADMIN: ['DEAN', 'REGISTRAR', 'HOD', 'COORDINATOR', 'ADMISSIONS_OFFICER'],
  DEAN: ['HOD'],
  HOD: ['COORDINATOR'],
  REGISTRAR: ['ADMISSIONS_OFFICER'],
  COORDINATOR: [],
  ADMISSIONS_OFFICER: [],
};
