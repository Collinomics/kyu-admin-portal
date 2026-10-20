// Desktop sidebar — main navigation, the top programme queries panel
// (last 30 days, pushed to the bottom), and a copyright footer.
// Hidden on mobile (<=860px), where the hamburger dropdown takes over.

import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";
import { fetchOverview } from "../services/monitoringService";
import type { TopProgramme } from "../data/mockEngine";
import { fmtInt } from "./charts/format";

export function Sidebar() {
  const [top, setTop] = useState<TopProgramme[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchOverview("30d").then((s) => alive && setTop(s.topProgrammes.slice(0, 6)));
    return () => {
      alive = false;
    };
  }, []);

  const maxShare = top ? Math.max(...top.map((i) => i.share)) : 1;

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <nav className="side-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* pushed to the bottom of the sidebar, just above the footer */}
      <section className="side-programmes" aria-label="Top programme queries">
        <div className="side-section-title">Top programme queries</div>
        <div className="side-section-hint">Last 30 days</div>
        {top === null ? (
          <div className="side-section-hint">Loading…</div>
        ) : (
          top.map((p, i) => (
            <div className="side-prog-row" key={p.name}>
              <div className="side-prog-top">
                <span className="side-prog-rank">{i + 1}</span>
                <span className="side-prog-name" title={p.name}>
                  {p.name}
                </span>
                <span className="side-prog-count">{fmtInt(p.queries)}</span>
              </div>
              <div className="side-prog-bar">
                <div
                  className="side-prog-fill"
                  style={{ width: `${Math.max(6, (p.share / maxShare) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="sidebar-footer">
        <div className="copy">© 2026 Kyambogo University</div>
        <div className="sub">AI Admissions Assistant · Monitor</div>
      </footer>
    </aside>
  );
}
