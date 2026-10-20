// =====================================================
// Shared user-management and delegation types.
// =====================================================

export type UserRole =
  | 'SYSADMIN' | 'DEAN' | 'REGISTRAR' | 'HOD' | 'COORDINATOR' | 'ADMISSIONS_OFFICER';

export type UserStatus = 'active' | 'pending' | 'locked' | 'suspended' | 'inactive';

export type StaffStatus = 'permanent' | 'temporary' | 'part-time' | 'contract';

export interface OfficerPermissions { create: boolean; monitor: boolean; close: boolean; }

export interface UserAccount {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  unit: string;              // human-readable scope shown in tables
  status: UserStatus;
  createdBy: string;
  createdAt: string;
  canDelete: boolean;
  // Delegation details.
  faculty?: string;
  facultyId?: string;
  department?: string;
  departmentId?: string;
  staffStatus?: StaffStatus;
  programme?: string;
  programmeId?: string;
  programmeIds?: string[];
  programmes?: string[];
  assignmentStart?: string;
  assignmentEnd?: string;    // D8: write access auto-suspends at this date
  assignmentEffective?: boolean;
  instructions?: string;
  priorReview?: boolean;
  call?: string;
  callId?: string;
  callIds?: string[];
  calls?: string[];
  permissions?: OfficerPermissions;
}

export interface FacultyOption {
  id: string;
  name: string;
  departments: Array<{ id: string; name: string }>;
}

export interface UserManagementOptions {
  faculties: FacultyOption[];
  programmes: Array<{ id: string; name: string; code?: string; academic_unit?: string; department?: string }>;
  calls: Array<{ id: string; name: string }>;
}

export interface CreateUserInput {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  facultyId?: string;
  departmentId?: string;
  staffStatus?: StaffStatus;
  programmeId?: string;
  programmeIds?: string[];
  assignmentStart?: string;
  assignmentEnd?: string;
  instructions?: string;
  priorReview?: boolean;
  call?: string;
  callId?: string;
  callIds?: string[];
  permissions?: OfficerPermissions;
}

export interface OnboardingInvitation {
  kind: 'onboarding' | 'password_reset';
  url?: string;
  expiresIn: number;
  developmentOtp?: string;
}

export interface AddAssignmentsInput {
  programmeIds?: string[];
  callIds?: string[];
  assignmentStart?: string;
  assignmentEnd?: string;
  instructions?: string;
  priorReview?: boolean;
  permissions?: OfficerPermissions;
}

export const roleLabels: Record<UserRole, string> = {
  SYSADMIN: 'System Administrator',
  DEAN: 'Dean of Faculty/School',
  REGISTRAR: 'Academic Registrar',
  HOD: 'Head of Department',
  COORDINATOR: 'Programme Coordinator',
  ADMISSIONS_OFFICER: 'Admissions Officer',
};

export const staffStatusLabels: Record<StaffStatus, string> = {
  permanent: 'Permanent',
  temporary: 'Temporary',
  'part-time': 'Part-time',
  contract: 'Contract',
};
