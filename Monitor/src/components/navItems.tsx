// Shared navigation items — rendered in the desktop sidebar and in the
// mobile hamburger dropdown (keeps the two views in lockstep).

import { LayoutDashboard, ScrollText, FileStack, UserRound, Settings } from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard size={16} />, end: true },
  { to: "/audit", label: "Audit Log", icon: <ScrollText size={16} />, end: false },
  { to: "/documents", label: "Data Sources", icon: <FileStack size={16} />, end: false },
  { to: "/settings", label: "Settings", icon: <Settings size={16} />, end: false },
  { to: "/account", label: "Account", icon: <UserRound size={16} />, end: false },
];
