// Account service — profile, password, and console members.
// Mock implementation persists to localStorage so edits survive reloads;
// every mutation also lands in the audit trail (visible on the Audit Log
// page). Swap USE_MOCK = false + real endpoints here when the backend auth
// exists — pages consume these types unchanged.

import { getStore } from "../data/mockEngine";

export const USE_MOCK_ACCOUNT = true;
const KEY = "kyu-monitor-account-v1";

export type MemberRole = "Super Admin" | "Admin" | "Viewer";
export type MemberStatus = "active" | "invited";

export interface Profile {
  name: string;
  email: string;
  role: MemberRole;
  avatar: string | null; // data URL, or null for initials
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  addedAt: number;
}

interface Store {
  profile: Profile;
  members: Member[];
}

const SEED: Store = {
  profile: {
    name: "Moses Asiimwe",
    email: "m.asiimwe@kyu.ac.ug",
    role: "Super Admin",
    avatar: null,
  },
  members: [
    { id: "mem-1", name: "Nakato Owino", email: "n.owino@kyu.ac.ug", role: "Admin", status: "active", addedAt: Date.now() - 24 * 86400_000 },
    { id: "mem-2", name: "Brian Ssemakula", email: "b.ssemakula@kyu.ac.ug", role: "Viewer", status: "active", addedAt: Date.now() - 9 * 86400_000 },
    { id: "mem-3", name: "Joy Namuli", email: "j.namuli@kyu.ac.ug", role: "Viewer", status: "invited", addedAt: Date.now() - 2 * 86400_000 },
  ],
};

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* private mode */
  }
  localStorage.setItem(KEY, JSON.stringify(SEED));
  return structuredClone(SEED);
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
}

const MOCK_LATENCY = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 200));

export async function fetchProfile(): Promise<Profile> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    return { ...load().profile };
  }
  const res = await fetch("/api/account/profile");
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return res.json();
}

export async function saveProfile(patch: { name: string; email: string; avatar: string | null }): Promise<Profile> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    const store = load();
    store.profile = { ...store.profile, ...patch };
    save(store);
    getStore().live.pushEvent({
      actor: store.profile.name,
      action: "config.update",
      severity: "info",
      detail: "Updated account profile",
      sessionId: "console",
    });
    return { ...store.profile };
  }
  const res = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return res.json();
}

export async function changePassword(payload: { current: string; next: string }): Promise<void> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    if (!payload.current) throw new Error("Enter your current password");
    if (payload.next.length < 8) throw new Error("New password must be at least 8 characters");
    getStore().live.pushEvent({
      actor: load().profile.name,
      action: "auth.login",
      severity: "warning",
      detail: "Password changed",
      sessionId: "console",
    });
    return;
  }
  const res = await fetch("/api/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`password ${res.status}`);
}

export async function fetchMembers(): Promise<Member[]> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    return [...load().members].sort((a, b) => b.addedAt - a.addedAt);
  }
  const res = await fetch("/api/account/members");
  if (!res.ok) throw new Error(`members ${res.status}`);
  return res.json();
}

export async function addMember(input: { name: string; email: string; role: MemberRole }): Promise<Member> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    const store = load();
    const member: Member = {
      id: `mem-${Date.now().toString(36)}`,
      name: input.name,
      email: input.email,
      role: input.role,
      status: "invited",
      addedAt: Date.now(),
    };
    store.members.push(member);
    save(store);
    getStore().live.pushEvent({
      actor: store.profile.name,
      action: "auth.signup",
      severity: "info",
      detail: `Invited ${input.name} (${input.email}) as ${input.role}`,
      sessionId: "console",
    });
    return member;
  }
  const res = await fetch("/api/account/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`members ${res.status}`);
  return res.json();
}

export async function removeMember(id: string): Promise<void> {
  if (USE_MOCK_ACCOUNT) {
    await MOCK_LATENCY();
    const store = load();
    const member = store.members.find((m) => m.id === id);
    store.members = store.members.filter((m) => m.id !== id);
    save(store);
    if (member) {
      getStore().live.pushEvent({
        actor: store.profile.name,
        action: "config.update",
        severity: "warning",
        detail: `Removed ${member.name} (${member.email}) from the console`,
        sessionId: "console",
      });
    }
    return;
  }
  const res = await fetch(`/api/account/members/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`members ${res.status}`);
}
