// Navbar user profile — avatar chip with a dropdown (name, role, account
// link, sign out). Reads the live profile from services/accountService.ts,
// so edits on the Account page show up here.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { fetchProfile, type Profile } from "../services/accountService";
import { fetchSettings } from "../services/monitoringService";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ProfileMenu() {
  const { ref, open, setOpen } = useClickOutside<HTMLDivElement>();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let alive = true;
    fetchProfile().then((p) => alive && setProfile(p));
    // the DB-stored avatar (Settings page) wins over the local one
    fetchSettings().then((st) => alive && setAvatar(st.profile_avatar || null));
    return () => {
      alive = false;
    };
  }, []);

  const [avatar, setAvatar] = useState<string | null>(null);

  const name = profile?.name ?? "…";
  const role = profile?.role ?? "Super Admin";
  const avatarUrl = avatar || profile?.avatar || null;

  return (
    <div className="nav-pop" ref={ref}>
      <button
        className="nav-tool profile-chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User profile"
      >
        <span
          className="avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
        >
          {!avatarUrl && initials(name)}
        </span>
        <span className="nav-tool-text">{name}</span>
      </button>

      {open && (
        <div className="panel profile-panel" role="menu">
          <div className="profile-head">
            <span
              className="avatar lg"
              style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
            >
              {!avatarUrl && initials(name)}
            </span>
            <div>
              <div className="panel-title">{name}</div>
              <div className="panel-hint">{profile?.email ?? "m.asiimwe@kyu.ac.ug"} · {role}</div>
            </div>
          </div>
          <div className="profile-meta">
            <ShieldCheck size={13} style={{ color: "var(--status-good)" }} />
            <span className="small">Monitoring console access</span>
          </div>
          <div className="profile-actions">
            <Link to="/account" className="btn" onClick={() => setOpen(false)}>
              <UserRound size={14} />
              Account settings
            </Link>
            <button
              className="btn profile-signout"
              onClick={() => setOpen(false)}
              title="Demo — auth arrives with the backend"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
