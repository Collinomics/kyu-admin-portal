// Account — the super admin's profile (picture, name, email), password
// change, and console member management. Mutations flow through
// services/accountService.ts and land in the audit trail.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  KeyRound,
  Mail,
  ShieldCheck,
  UserPlus,
  Trash2,
  CircleCheck,
  CircleX,
} from "lucide-react";
import {
  fetchProfile,
  saveProfile,
  changePassword,
  fetchMembers,
  addMember,
  removeMember,
  type Member,
  type MemberRole,
} from "../services/accountService";
import { fmtAgo, fmtDay } from "../components/charts/format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

const ROLE_BADGE: Record<MemberRole, string> = {
  "Super Admin": "warning",
  Admin: "info",
  Viewer: "neutral",
};

export function AccountPage() {
  const [profile, setProfile] = useState<{ name: string; email: string; role: MemberRole; avatar: string | null } | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Viewer" as MemberRole });
  const [adding, setAdding] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; kind: "ok" | "err"; text: string }[]>([]);
  const toastId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const toast = useCallback((kind: "ok" | "err", text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refreshMembers = useCallback(() => {
    fetchMembers().then(setMembers);
  }, []);

  useEffect(() => {
    fetchProfile().then(setProfile);
    refreshMembers();
  }, [refreshMembers]);

  const onAvatarPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("err", "Please choose an image file");
      return;
    }
    if (file.size > 512 * 1024) {
      toast("err", "Profile picture must be under 512 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!profile.name.trim()) return toast("err", "Name is required");
    if (!EMAIL_RE.test(profile.email)) return toast("err", "Enter a valid email address");
    setSavingProfile(true);
    try {
      const saved = await saveProfile({
        name: profile.name.trim(),
        email: profile.email.trim(),
        avatar: avatarPreview,
      });
      setProfile(saved);
      setAvatarPreview(saved.avatar);
      toast("ok", "Profile saved");
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast("err", "New password and confirmation do not match");
    setChangingPw(true);
    try {
      await changePassword({ current: pw.current, next: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast("ok", "Password changed");
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Could not change password");
    } finally {
      setChangingPw(false);
    }
  };

  const onAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast("err", "Member name is required");
    if (!EMAIL_RE.test(form.email)) return toast("err", "Enter a valid email address");
    setAdding(true);
    try {
      await addMember({ name: form.name.trim(), email: form.email.trim(), role: form.role });
      setForm({ name: "", email: "", role: "Viewer" });
      refreshMembers();
      toast("ok", "Invitation sent");
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Could not add member");
    } finally {
      setAdding(false);
    }
  };

  const onRemoveMember = async (m: Member) => {
    try {
      await removeMember(m.id);
      refreshMembers();
      toast("ok", `${m.name} removed from the console`);
    } catch {
      toast("err", "Could not remove member");
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <div className="sub">Profile, security and console members managed as {profile?.role ?? "Super Admin"}</div>
        </div>
        <span className="badge warning">
          <ShieldCheck size={12} /> Super Admin
        </span>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        {/* profile + password */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <form className="card" onSubmit={onSaveProfile}>
            <div className="card-head">
              <h3>My profile</h3>
              <span className="hint">Visible to console members</span>
            </div>
            <div className="profile-edit">
              <button
                type="button"
                className="avatar lg profile-avatar"
                onClick={() => fileInput.current?.click()}
                title="Set profile picture"
                style={avatarPreview ? { backgroundImage: `url(${avatarPreview})` } : undefined}
              >
                {!avatarPreview && (profile ? initials(profile.name) : "…")}
                <span className="avatar-cam">
                  <Camera size={12} />
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onAvatarPick(e.target.files?.[0])}
              />
              <div className="profile-fields">
                <label className="form-field">
                  <span className="ff-label">Full name</span>
                  <input
                    value={profile?.name ?? ""}
                    onChange={(e) => setProfile((p) => (p ? { ...p, name: e.target.value } : p))}
                    placeholder="Your name"
                  />
                </label>
                <label className="form-field">
                  <span className="ff-label">Email</span>
                  <input
                    type="email"
                    value={profile?.email ?? ""}
                    onChange={(e) => setProfile((p) => (p ? { ...p, email: e.target.value } : p))}
                    placeholder="you@kyu.ac.ug"
                  />
                </label>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              <Mail size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Your email is used for sign-in and member invitations.
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn primary" type="submit" disabled={savingProfile || !profile}>
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>

          <form className="card" onSubmit={onChangePassword}>
            <div className="card-head">
              <h3>Change password</h3>
              <KeyRound size={15} style={{ color: "var(--ink-3)" }} />
            </div>
            <div className="form-stack">
              <label className="form-field">
                <span className="ff-label">Current password</span>
                <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
              </label>
              <label className="form-field">
                <span className="ff-label">New password</span>
                <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="At least 8 characters" />
              </label>
              <label className="form-field">
                <span className="ff-label">Confirm new password</span>
                <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
              </label>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Demo — real authentication arrives with the backend.
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn primary" type="submit" disabled={changingPw}>
                {changingPw ? "Changing…" : "Change password"}
              </button>
            </div>
          </form>
        </div>

        {/* members */}
        <div className="card" style={{ padding: "8px 12px 12px" }}>
          <div className="card-head" style={{ padding: "10px 8px 6px" }}>
            <div>
              <h3>Console members</h3>
              <div className="hint">People who can access this monitoring console</div>
            </div>
            <span className="small muted">{members?.length ?? "…"} member{members?.length === 1 ? "" : "s"}</span>
          </div>

          <form className="member-add" onSubmit={onAddMember}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              aria-label="Member name"
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email address"
              aria-label="Member email"
            />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as MemberRole })} aria-label="Member role">
              <option value="Viewer">Viewer</option>
              <option value="Admin">Admin</option>
              <option value="Super Admin">Super Admin</option>
            </select>
            <button className="btn primary" type="submit" disabled={adding}>
              <UserPlus size={14} />
              {adding ? "Adding…" : "Add"}
            </button>
          </form>

          {members === null ? (
            <div className="empty-state">
              <div className="e-title">Loading members…</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="row-hover">
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="avatar" style={{ width: 30, height: 30 }}>{initials(m.name)}</span>
                          <div>
                            <div className="cell-main">{m.name}</div>
                            <div className="cell-sub">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${ROLE_BADGE[m.role]}`}>{m.role}</span>
                      </td>
                      <td>
                        <span className={`badge ${m.status === "active" ? "good" : "neutral"}`}>
                          {m.status === "active" ? "Active" : "Invited"}
                        </span>
                      </td>
                      <td className="small nowrap" title={fmtDay(m.addedAt)}>{fmtAgo(m.addedAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn sm"
                          onClick={() => onRemoveMember(m)}
                          disabled={m.role === "Super Admin"}
                          title={m.role === "Super Admin" ? "You cannot remove a super admin" : "Remove member"}
                          aria-label={`Remove ${m.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" style={t.kind === "err" ? { background: "var(--status-critical)" } : undefined}>
            {t.kind === "ok" ? <CircleCheck size={16} /> : <CircleX size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}
