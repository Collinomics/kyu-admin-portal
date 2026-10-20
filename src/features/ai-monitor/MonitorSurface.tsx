import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import paletteCss from '../../../Monitor/src/styles/palette.css?inline';
import globalCss from '../../../Monitor/src/styles/global.css?inline';
import chartsCss from '../../../Monitor/src/styles/charts.css?inline';

const integrationCss = `
  :host { display: block; min-width: 0; container-type: inline-size; }
  .monitor-body { min-width: 0; }

  @container (max-width: 720px) {
    .page { padding: 18px 14px 48px; }
    .page-header h1 { font-size: 1.3rem; }
    .grid.cols-6, .grid.cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid.cols-3, .grid.cols-2 { grid-template-columns: minmax(0, 1fr); }
    .grid .span-2 { grid-column: auto; }
    .filter-row { gap: 8px; padding: 10px; }
    .filter-spacer { display: none; }
    .filter-field { flex: 1 1 auto; min-width: 0; }
    .filter-field .search { min-width: 0; width: 100%; }
    .seg { flex-wrap: wrap; }
    .pager { flex-wrap: wrap; gap: 8px; }
    .pipeline { flex-wrap: wrap; row-gap: 10px; }
    .pipeline .stage { flex: 1 1 110px; }
  }

  @container (max-width: 440px) {
    .grid.cols-6, .grid.cols-4 { grid-template-columns: minmax(0, 1fr); }
    .stat-tile .value { font-size: 1.5rem; }
  }
`;

const isolatedCss = `${paletteCss}\n${globalCss.replace(/@import\s+["']\.\/palette\.css["'];?/g, '')}\n${chartsCss}\n${integrationCss}`
  .replaceAll(':root', ':host')
  .replace(/(^|})\s*html\s*\{/gm, '$1 :host {')
  .replace(/(^|})\s*body\s*\{/gm, '$1 .monitor-body {');

export default function MonitorSurface({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const existingTarget = shadow.querySelector<HTMLDivElement>('[data-monitor-portal]');
    if (existingTarget) {
      setPortalTarget(existingTarget);
      return;
    }

    const style = document.createElement('style');
    const target = document.createElement('div');
    style.textContent = isolatedCss;
    target.className = 'monitor-body';
    target.dataset.monitorPortal = 'true';
    shadow.append(style, target);
    setPortalTarget(target);
  }, []);

  return (
    <div
      ref={hostRef}
      data-monitor-host
      className="block min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {portalTarget ? createPortal(children, portalTarget) : null}
    </div>
  );
}
