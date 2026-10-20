// Top navbar — Kyambogo logo + name + amber motto, top-programmes expander,
// user profile, live API status pill, wall clock, theme toggle.
// On desktop, page navigation lives in the Sidebar; on mobile the links
// collapse into the hamburger dropdown.

import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Moon, Sun, Menu, X } from "lucide-react";
import { KyambogoCrest } from "./KyambogoCrest";
import { NAV_ITEMS } from "./navItems";
import { ProfileMenu } from "./ProfileMenu";
import { useLive } from "../hooks/useLive";
import { useTheme } from "../hooks/useTheme";

function WallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="navbar-clock" aria-label="Local time">
      {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export function Navbar() {
  const live = useLive();
  const [theme, toggleTheme] = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Prefer the official logo dropped at public/kyambogo-logo.png
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLogoUrl("/kyambogo-logo.png");
    img.src = "/kyambogo-logo.png";
  }, []);

  const healthy = live.apiOverall === "good";
  const close = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand" onClick={close}>
        <span className={`navbar-logo ${logoUrl ? "wide" : ""}`}>
          {logoUrl ? <img src={logoUrl} alt="Kyambogo University logo" /> : <KyambogoCrest />}
        </span>
        <span className="navbar-titles">
          <span className="t1">Kyambogo University</span>
          <span className="motto">Knowledge and Skills for Service</span>
        </span>
      </NavLink>

      {/* mobile-only hamburger dropdown (desktop navigation is the Sidebar) */}
      <nav className={`navbar-links ${menuOpen ? "open" : ""}`} aria-label="Main">
        {NAV_ITEMS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={close}
            className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
          >
            {l.icon}
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="navbar-right">
        <span className="navbar-status" title={healthy ? "All systems normal" : "One or more services degraded"}>
          <span className={`live-dot ${healthy ? "good" : "critical"}`} />
          <span className="navbar-status-text">{healthy ? "Systems normal" : "Degraded"}</span>
        </span>
        <WallClock />
        <ProfileMenu />
        <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="icon-btn navbar-burger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </header>
  );
}
