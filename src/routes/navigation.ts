import { LayoutDashboard, Users, BookOpen, GraduationCap, Settings, ScrollText, ShieldCheck, Bot, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '../features/users/types';

export interface NavItem { name: string; path: string; icon: LucideIcon; roles: UserRole[]; }
export interface NavSection { label: string; items: NavItem[]; }

const ALL: UserRole[] = ['SYSADMIN', 'DEAN', 'REGISTRAR', 'HOD', 'COORDINATOR', 'ADMISSIONS_OFFICER'];

// Menu structure and the roles that may see each item.
export const navSections: NavSection[] = [
  { label: 'Overview', items: [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, roles: ALL },
  ]},
  { label: 'Governance', items: [
    { name: 'User Management', path: '/admin/users', icon: Users, roles: ['SYSADMIN', 'DEAN', 'HOD', 'REGISTRAR'] },
    { name: 'Organisation', path: '/admin/organisation', icon: Building2, roles: ['SYSADMIN'] },
    { name: 'Affiliated Institutions', path: '/admin/affiliates', icon: Building2, roles: ['SYSADMIN'] },
    { name: 'System Settings', path: '/admin/settings', icon: Settings, roles: ['SYSADMIN'] },
    { name: 'Audit Log', path: '/admin/audit-log', icon: ScrollText, roles: ['SYSADMIN'] },
    { name: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck, roles: ['SYSADMIN'] },
  ]},
  { label: 'Academics', items: [
    { name: 'Course Profiling', path: '/admin/programmes', icon: BookOpen, roles: ['SYSADMIN', 'DEAN', 'HOD', 'COORDINATOR'] },
  ]},
  { label: 'Admissions', items: [
    { name: 'Admissions', path: '/admin/admissions', icon: GraduationCap, roles: ['SYSADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER'] },
  ]},
  { label: 'AI Assistant', items: [
    { name: 'AI Monitor', path: '/admin/ai-monitor', icon: Bot, roles: ['SYSADMIN'] },
  ]},
  { label: 'Account', items: [
    { name: 'My Account', path: '/admin/profile', icon: Settings, roles: ALL },
  ]},
];

// Deny by default: unknown paths are rejected.
export function canAccess(role: UserRole, path: string): boolean {
  for (const section of navSections) {
    const item = section.items.find((i) => path.startsWith(i.path));
    if (item) return item.roles.includes(role);
  }
  return false;
}
