import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUp, Bookmark, BookOpen, Bot, Building2, CalendarDays, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Filter, LoaderCircle, Menu,
  GraduationCap, Mail, MapPin, Phone, RefreshCw, Search, ShieldCheck, Sparkles, Star, Trash2, WifiOff, X,
} from 'lucide-react';
import { fetchCatalogue, fetchCatalogueRevision, fetchPublicProgramme } from './catalogueService';
import type { CatalogueResponse, PublicProgramme } from './types';
import { UNIVERSITY } from '../../utils/university';
import kyuLogo from '../../assets/kyu-logo.png';
import { useToast } from '../../components/ui/KyToast';
import { DEFAULT_PUBLIC_CATALOGUE_SETTINGS, type PublicCatalogueSettings } from '../settings/settingsService';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchApi } from '../../services/api';
import './catalogue-bootstrap.css';

const PublicAiWidget = lazy(() => import('./PublicAiWidget'));
const EMPTY: CatalogueResponse = {
  programmes: [], meta: { currentPage: 1, lastPage: 1, perPage: 12, total: 0, revision: '' },
  summary: { publishedProgrammes: 0, academicUnits: 0, callsClosingSoon: 0 },
  filters: { faculties: [], categories: [] },
  configuration: DEFAULT_PUBLIC_CATALOGUE_SETTINGS,
};

function programmeIdFromLocation(): string | null {
  const match = window.location.hash.match(/^#programme\/([^/?#]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

function programmeFromHistory(): PublicProgramme | null {
  const programme = window.history.state?.kyuProgramme as PublicProgramme | undefined;
  return programme && typeof programme.id === 'string' ? programme : null;
}

function catalogueHistoryState() {
  const state = { ...(window.history.state ?? {}) };
  delete state.kyuProgramme;
  delete state.kyuCatalogueEntry;
  return state;
}

function storedBookmarkIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('kyu-catalogue-bookmarks') ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function appStatus(programme: PublicProgramme) {
  const value = programme.application?.status ?? 'closed';
  if (value === 'open') return { label: 'Applications open', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' };
  if (value === 'closing-soon') return { label: 'Closing soon', tone: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' };
  if (value === 'scheduled') return { label: 'Opening soon', tone: 'border-blue-200 bg-blue-50 text-blue-700', bar: 'bg-blue-500' };
  return { label: 'No open call', tone: 'border-slate-200 bg-slate-50 text-slate-600', bar: 'bg-slate-300' };
}

function readableDate(date?: string) {
  if (!date) return 'Not announced';
  return new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
}

function Logo() {
  return <img src={kyuLogo} alt="Kyambogo University crest" className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12" />;
}

function ProgrammeDetailHeader({ onBack, onAskAi, showBookmarks, bookmarked, onBookmark }: { onBack: () => void; onAskAi: () => void; showBookmarks: boolean; bookmarked: boolean; onBookmark: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b3765] text-white shadow-lg">
    <div className="mx-auto flex h-[68px] max-w-7xl items-center px-4 sm:px-6">
      <button onClick={onBack} className="flex min-w-0 items-center gap-3 text-left"><Logo /><span className="min-w-0"><span className="public-display block truncate text-sm font-bold sm:text-base">Kyambogo University</span><span className="block truncate text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300 sm:text-[10px]">Programme Catalogue</span></span></button>
      <nav className="ml-auto hidden items-center gap-1 text-sm md:flex"><button onClick={onBack} className="rounded-lg bg-white/10 px-3 py-2 font-semibold text-amber-300">Catalogue</button><button onClick={onAskAi} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10"><Bot size={16} /> Ask AI</button>{showBookmarks && <button onClick={onBookmark} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${bookmarked ? 'bg-amber-300 text-slate-950' : 'hover:bg-white/10'}`}><Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} /> {bookmarked ? 'Bookmarked' : 'Bookmark'}</button>}</nav>
      <button onClick={() => setMobileOpen((open) => !open)} className="ml-auto rounded-xl p-2 hover:bg-white/10 md:hidden" aria-expanded={mobileOpen} aria-controls="programme-mobile-navigation" aria-label="Toggle navigation">{mobileOpen ? <X /> : <Menu />}</button>
    </div>
    {mobileOpen && <nav id="programme-mobile-navigation" className="border-t border-white/10 px-4 py-3 text-sm md:hidden"><button onClick={onBack} className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-amber-300"><Search size={17} /> Explore programmes</button><button onClick={onAskAi} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10"><Bot size={17} /> Ask the programme assistant</button>{showBookmarks && <button onClick={onBookmark} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10"><Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} /> {bookmarked ? 'Remove bookmark' : 'Bookmark programme'}</button>}</nav>}
  </header>;
}

function ProgrammeDetailFooter({ configuration, onBack, onAskAi }: { configuration: PublicCatalogueSettings; onBack: () => void; onAskAi: () => void }) {
  const returnToDetailTop = () => document.getElementById('programme-detail')?.scrollTo({ top: 0, behavior: 'smooth' });
  return <footer className="relative mt-10 overflow-hidden bg-[#082f59] text-blue-100" aria-label="Public catalogue footer">
    <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full border-[44px] border-white/[0.025]" aria-hidden="true" />
    <div className="mx-auto max-w-7xl px-4 py-11 sm:px-6 sm:py-14">
      <div className="grid gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1.15fr] lg:gap-8">
        <section><div className="flex items-center gap-3"><Logo /><div><h2 className="public-display text-base font-bold text-white">{UNIVERSITY.name}</h2><p className="text-xs font-semibold text-amber-300">{UNIVERSITY.motto}</p></div></div><p className="mt-5 max-w-sm text-sm leading-6 text-blue-200">Explore verified programmes, official admission requirements and current application opportunities in one trusted catalogue.</p><div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200"><ShieldCheck size={14} /> Official university information</div></section>
        <nav aria-label="Explore catalogue"><h2 className="public-display text-sm font-bold text-white">Explore</h2><ul className="mt-4 space-y-3 text-sm"><li><button onClick={onBack} className="inline-flex items-center gap-2 text-left transition hover:text-amber-300"><BookOpen size={15} /> Programmes</button></li><li><button onClick={onAskAi} className="inline-flex items-center gap-2 text-left transition hover:text-amber-300"><Bot size={15} /> Ask AI</button></li></ul></nav>
        <nav aria-label="University portals"><h2 className="public-display text-sm font-bold text-white">Useful links</h2><ul className="mt-4 space-y-3 text-sm">{configuration.showApplicationLinks && <li><a href={configuration.applicationPortalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-amber-300">Apply online <ExternalLink size={13} /></a></li>}<li><a href={UNIVERSITY.studentPortal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-amber-300">Student portal <ExternalLink size={13} /></a></li></ul></nav>
        <section><h2 className="public-display text-sm font-bold text-white">Contact the university</h2><address className="mt-4 space-y-3 text-sm not-italic leading-5"><p className="flex items-start gap-2.5"><MapPin size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.address}</span></p><a href="tel:+256414285037" className="flex items-start gap-2.5 transition hover:text-amber-300"><Phone size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.phone}</span></a><a href={`mailto:${UNIVERSITY.email}`} className="flex items-start gap-2.5 break-all transition hover:text-amber-300"><Mail size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.email}</span></a></address></section>
      </div>
      <div className="flex flex-col gap-4 pt-6 text-xs text-blue-300 sm:flex-row sm:items-center sm:justify-between"><div><p>© {new Date().getFullYear()} {UNIVERSITY.name}. All rights reserved.</p><p className="mt-1 text-blue-400">Programme information is published through the governed KYU PCS workflow.</p></div><button onClick={returnToDetailTop} className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-bold text-white transition hover:border-amber-300/40 hover:bg-white/10 hover:text-amber-300">Back to top <ArrowUp size={14} /></button></div>
    </div>
  </footer>;
}

function PageNumbers({ current, last, onChange }: { current: number; last: number; onChange: (page: number) => void }) {
  const pages = useMemo(() => [...new Set([1, last, current - 1, current, current + 1])].filter((n) => n > 0 && n <= last).sort((a, b) => a - b), [current, last]);
  const button = 'flex h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 disabled:opacity-40';
  return <nav aria-label="Catalogue pages" className="flex flex-wrap items-center justify-center gap-2">
    <button disabled={current <= 1} onClick={() => onChange(current - 1)} className={button} aria-label="Previous page"><ChevronLeft size={18} /></button>
    <div className="hidden items-center gap-2 sm:flex">{pages.map((value, index) => <span key={value} className="contents">{index > 0 && value - pages[index - 1] > 1 && <span className="text-slate-400">…</span>}<button onClick={() => onChange(value)} aria-current={value === current ? 'page' : undefined} className={`${button} ${value === current ? '!border-[#0E3F73] !bg-[#0E3F73] !text-white' : ''}`}>{value}</button></span>)}</div>
    <span className="px-2 text-sm text-slate-500 sm:hidden">Page <strong className="text-slate-900">{current}</strong> of {last}</span>
    <button disabled={current >= last} onClick={() => onChange(current + 1)} className={button} aria-label="Next page"><ChevronRight size={18} /></button>
  </nav>;
}

function CatalogueFilterDropdown({ label, value, allLabel, options, icon, onChange }: {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  icon: ReactNode;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? allLabel;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const focusOption = (position: 'selected' | 'first' | 'last') => window.requestAnimationFrame(() => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!items.length) return;
    if (position === 'last') items.at(-1)?.focus();
    else if (position === 'selected') (items.find((item) => item.getAttribute('aria-selected') === 'true') ?? items[0])?.focus();
    else items[0]?.focus();
  });
  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    focusOption(event.key === 'ArrowUp' || event.key === 'End' ? 'last' : event.key === 'Home' ? 'first' : 'selected');
  };
  const navigateOptions = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false); triggerRef.current?.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  };

  return <div ref={rootRef} className="relative min-w-0">
    <span id={labelId} className="mb-2 block text-xs font-bold text-slate-700">{label}</span>
    <button ref={triggerRef} type="button" onClick={() => setOpen((current) => !current)} onKeyDown={openFromKeyboard} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-labelledby={labelId} className={`flex h-12 w-full items-center gap-3 rounded-xl border bg-slate-50 px-3 text-left text-sm outline-none transition ${open ? 'border-[#1B5EA9] bg-white ring-4 ring-blue-100' : 'border-slate-200 hover:border-blue-300 hover:bg-white'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${value ? 'bg-[#0E3F73] text-white' : 'bg-blue-50 text-[#1B5EA9]'}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{selectedLabel}</span>
      {value && <span className="hidden shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-blue-700 sm:inline">Active</span>}
      <ChevronDown size={17} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div ref={listRef} id={listId} onKeyDown={navigateOptions} className="ky-drop-enter absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="listbox" aria-labelledby={labelId}>
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Choose {label.toLowerCase()}</div>
      <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
        {[{ value: '', label: allLabel }, ...options].map((option) => {
          const selected = option.value === value;
          return <button key={option.value || 'all'} type="button" role="option" aria-selected={selected} onClick={() => choose(option.value)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected ? 'bg-[#0E3F73] font-bold text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-[#0E3F73]'}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-white/40 bg-white/15' : 'border-slate-200'}`}>{selected && <CheckCircle2 size={13} />}</span>
            <span className="min-w-0 flex-1 leading-5">{option.label}</span>
          </button>;
        })}
      </div>
    </div>}
  </div>;
}

function ApplicationPanel({ programme, configuration, accent, duration, onAskAi, onViewRequirements }: { programme: PublicProgramme; configuration: PublicCatalogueSettings; accent: string; duration: string; onAskAi: () => void; onViewRequirements: () => void }) {
  const meta = appStatus(programme);
  const canApply = ['open', 'closing-soon'].includes(programme.application?.status ?? '');
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="h-1.5" style={{ backgroundColor: accent }} />
    <div className="p-5 sm:p-6">
      <h2 className="text-xl font-extrabold text-slate-900">Programme essentials</h2>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Code</dt><dd className="mt-1 font-extrabold text-slate-800">{programme.code}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Duration</dt><dd className="mt-1 font-extrabold capitalize text-slate-800">{duration}</dd></div>
        <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Academic unit</dt><dd className="mt-1 font-bold leading-5 text-slate-800">{programme.faculty ?? 'Kyambogo University'}</dd></div>
        {programme.department && <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Department</dt><dd className="mt-1 font-bold text-slate-800">{programme.department}</dd></div>}
        {programme.campus && <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Campus / centre</dt><dd className="mt-1 font-bold text-slate-800">{programme.campus}</dd></div>}
        {programme.study_modes?.length > 0 && <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Study mode</dt><dd className="mt-1 font-bold text-slate-800">{programme.study_modes.join(' · ')}</dd></div>}
        {programme.application && <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Current intake</dt><dd className="mt-1 font-bold text-slate-800">{programme.application.intake}</dd></div>}
      </dl>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Admissions status</p>
      <p className={`mt-3 rounded-xl border px-3 py-2.5 text-center text-sm font-bold ${meta.tone}`}>{meta.label}</p>
      {programme.application ? <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Intake</dt><dd className="mt-1 font-semibold text-slate-800">{programme.application.intake}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Opens</dt><dd className="mt-1 text-xs font-semibold text-slate-800">{readableDate(programme.application.opening_date)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Deadline</dt><dd className="mt-1 text-xs font-semibold text-slate-800">{readableDate(programme.application.deadline)}</dd></div>
      </dl> : <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-700">Applications are not open yet</p><p className="mt-1 text-xs leading-5 text-slate-500">You can still review the programme and ask the assistant for published guidance.</p></div>}
      {configuration.showApplicationLinks && (canApply
        ? <a href={configuration.applicationPortalUrl} target="_blank" rel="noreferrer" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5" style={{ backgroundColor: accent }}>Apply now <ExternalLink size={15} /></a>
        : <span aria-disabled="true" className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400">Apply now <ExternalLink size={15} /></span>)}
      {sectionsLinkAvailable(programme) && <button onClick={onViewRequirements} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: accent }}>View entry requirements <ArrowRight size={14} /></button>}
      <button onClick={onAskAi} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100"><Bot size={16} /> Ask about this programme</button>
    </div>
  </div>;
}

function sectionsLinkAvailable(programme: PublicProgramme): boolean {
  return Boolean(programme.admission_requirements?.trim());
}

function RelatedProgrammes({ programme, configuration, accent, onOpen }: { programme: PublicProgramme; configuration: PublicCatalogueSettings; accent: string; onOpen: (programme: PublicProgramme) => void }) {
  const [related, setRelated] = useState<PublicProgramme[]>([]);
  const [loading, setLoading] = useState(Boolean(programme.faculty_id));

  useEffect(() => {
    if (!programme.faculty_id) {
      setRelated([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetchCatalogue({ page: 1, search: '', category: '', facultyId: programme.faculty_id }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setRelated(response.programmes.filter((item) => item.id !== programme.id).slice(0, 3));
      })
      .catch(() => { if (!controller.signal.aborted) setRelated([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [programme.faculty_id, programme.id]);

  if (!programme.faculty_id || (!loading && related.length === 0)) return null;

  return <section className="mt-8 border-t border-slate-200 pt-8 sm:mt-10 sm:pt-10" aria-labelledby="related-programmes-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: accent }}>Continue exploring</p><h2 id="related-programmes-title" className="public-display mt-1 text-2xl font-extrabold text-[#0E3F73] sm:text-3xl">Related programmes</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Other published programmes from {programme.faculty ?? 'the same academic unit'}.</p></div>
      {!loading && <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500">{related.length} {related.length === 1 ? 'option' : 'options'}</span>}
    </div>

    {loading ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-64 animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="h-1.5 bg-slate-200" /><div className="space-y-4 p-5"><div className="h-5 w-28 rounded-full bg-slate-100" /><div className="h-7 w-5/6 rounded bg-slate-200" /><div className="h-4 w-2/3 rounded bg-slate-100" /><div className="h-11 rounded-xl bg-slate-100" /></div></div>)}</div>
      : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => {
        const itemAccent = item.faculty_id ? configuration.academicUnitColours[item.faculty_id] : undefined;
        const itemDuration = item.duration || durationFromOverview(item.overview) || 'Not yet published';
        const status = appStatus(item);
        return <article data-reveal key={item.id} className="group flex min-h-64 flex-col overflow-hidden rounded-2xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg" style={{ borderTopColor: itemAccent ?? accent }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#0E3F73]">{item.category}</span><span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${status.tone}`}>{status.label}</span></div>
          <button onClick={() => onOpen(item)} className="mt-4 text-left"><h3 className="public-display line-clamp-3 text-lg font-extrabold leading-snug text-[#0E3F73] transition-colors group-hover:text-[#1B5EA9]">{item.name}</h3></button>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="font-bold uppercase tracking-wide text-slate-400">Code</dt><dd className="mt-0.5 font-extrabold text-slate-800">{item.code}</dd></div><div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="font-bold uppercase tracking-wide text-slate-400">Duration</dt><dd className="mt-0.5 truncate font-extrabold capitalize text-slate-800">{itemDuration}</dd></div></dl>
          {item.campus && <p className="mt-3 flex items-center gap-2 truncate text-[11px] text-slate-500"><MapPin size={13} className="shrink-0" /> {item.campus}</p>}
          <button onClick={() => onOpen(item)} className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E3F73] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#154A87]">View programme <ArrowRight size={14} /></button>
        </article>;
      })}</div>}
  </section>;
}

function ProgrammeContent({ content }: { content: string }) {
  const blocks = content.split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean);
  return <div className="space-y-4 text-[15px] leading-7 text-slate-600">
    {blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const isList = lines.length > 0 && lines.every((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line));
      if (isList) return <ul key={index} className="list-disc space-y-2 pl-5 marker:text-amber-500">{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^(?:[-*•]|\d+[.)])\s+/, '')}</li>)}</ul>;
      return <p key={index} className="whitespace-pre-line">{block}</p>;
    })}
  </div>;
}

function ProgrammeDetails({ programme, configuration, bookmarked, onBookmark, onClose, onAskAi, onOpenProgramme }: { programme: PublicProgramme; configuration: PublicCatalogueSettings; bookmarked: boolean; onBookmark: () => void; onClose: () => void; onAskAi: () => void; onOpenProgramme: (programme: PublicProgramme) => void }) {
  const detailRef = useRef<HTMLDivElement>(null);
  const meta = appStatus(programme);
  const sections = [
    ['Overview', programme.overview], ['Objective / Impact', programme.objective_impact],
    ['Philosophy & Originality', programme.philosophy_originality], ['Career Prospects', programme.career_prospects],
    ['Admission Requirements', programme.admission_requirements], ['Structure & Content / Units', programme.structure_content],
  ].filter(([, content]) => content?.trim());
  const unitColour = programme.faculty_id ? configuration.academicUnitColours[programme.faculty_id] : undefined;
  const accent = unitColour && /^#[0-9a-f]{6}$/i.test(unitColour) ? unitColour : '#0E3F73';
  const duration = programme.duration || durationFromOverview(programme.overview) || 'Not yet published';
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(sections.map(([heading]) => heading)));
  useEffect(() => { detailRef.current?.focus(); }, []);
  const sectionId = (heading: string) => `programme-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const scrollToSection = (heading: string) => {
    const scroller = document.getElementById('programme-detail');
    const target = document.getElementById(sectionId(heading));
    const navigation = document.getElementById('programme-section-navigation');
    if (!scroller || !target) return;

    const stickyHeaderAndCurve = 88;
    const navigationHeight = navigation?.getBoundingClientRect().height ?? 56;
    const targetTop = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: Math.max(0, targetTop - stickyHeaderAndCurve - navigationHeight - 16), behavior: 'smooth' });
  };
  const toggleSection = (heading: string) => setOpenSections((current) => {
    const next = new Set(current);
    if (next.has(heading)) next.delete(heading); else next.add(heading);
    return next;
  });
  return <div ref={detailRef} tabIndex={-1} id="programme-detail" className="public-catalogue fixed inset-0 z-[100] overflow-y-auto bg-[#f6f8fb] outline-none" role="dialog" aria-modal="true" aria-labelledby="programme-title">
    <ProgrammeDetailHeader onBack={onClose} onAskAi={onAskAi} showBookmarks={configuration.showBookmarks} bookmarked={bookmarked} onBookmark={onBookmark} />

    <section className="catalogue-hero programme-detail-hero relative flex min-h-[72svh] items-center overflow-hidden text-white" style={{ backgroundColor: accent }}>
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${adjustHex(accent, -30)}D1 0%, ${accent}B8 55%, ${adjustHex(accent, 12)}A3 100%)` }} aria-hidden="true" />
      <GraduationCap size={280} strokeWidth={0.8} className="absolute -bottom-20 -right-12 text-white/[0.07]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-11 sm:px-6 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <button onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/15 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur-sm transition hover:border-amber-300/50 hover:bg-white/15 hover:text-white"><ArrowLeft size={15} /> Back to catalogue</button>
        <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider">{programme.category}</span><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold">{meta.label}</span>{programme.is_featured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-950"><Star size={11} fill="currentColor" /> Featured</span>}</div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">{programme.faculty ?? 'Kyambogo University'}</p>
        <h1 id="programme-title" className="mt-2 max-w-5xl text-3xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">{programme.name}</h1>
        {programme.department && <p className="mt-4 inline-flex items-center gap-2 text-sm text-white/75"><Building2 size={16} /> {programme.department}</p>}
      </div>
    </section>

    {sections.length > 1 && <nav id="programme-section-navigation" aria-label="Programme information sections" className="programme-section-navigation sticky top-[88px] z-[15] border-bottom bg-white/95 py-3 shadow-sm backdrop-blur before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-5 before:bg-white"><div className="container-xxl overflow-x-auto px-4"><div className="programme-section-tabs nav nav-pills flex-nowrap gap-2">{sections.map(([heading], index) => <button data-reveal type="button" key={heading} onClick={() => scrollToSection(heading)} className="nav-link inline-flex shrink-0 items-center gap-2 rounded-pill border px-3 py-2 text-xs fw-bold"><span className="programme-section-number">{String(index + 1).padStart(2, '0')}</span>{heading}</button>)}</div></div></nav>}

    <main className="programme-details-bootstrap container-xxl py-4 py-lg-5">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><a href="https://kyu.ac.ug/" target="_blank" rel="noreferrer">Home</a></li>
          <li className="breadcrumb-item"><button type="button" onClick={onClose} className="programme-breadcrumb-link">Programme Catalogue</button></li>
          <li className="breadcrumb-item active" aria-current="page">{programme.name}</li>
        </ol>
      </nav>
      <div className="row g-4">
        <article className="col-lg-8 order-1">
          {sections.length ? sections.map(([heading, content], index) => {
            const expanded = openSections.has(heading);
            return <section data-reveal id={sectionId(heading)} key={heading} className="programme-section-card card mb-3 scroll-mt-[168px]">
              <button type="button" onClick={() => toggleSection(heading)} aria-expanded={expanded} aria-controls={`${sectionId(heading)}-content`} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${heading}`} className="programme-section-toggle card-header d-flex w-100 align-items-center justify-content-between gap-3 text-start">
                <span className="d-flex align-items-center gap-3"><span className="programme-section-index badge rounded-pill" style={{ backgroundColor: accent }}>{String(index + 1).padStart(2, '0')}</span><span className="h5 mb-0 fw-bold">{heading}</span></span>
                <span className="programme-section-chevron d-flex d-sm-none align-items-center justify-content-center rounded-circle" aria-hidden="true"><ChevronDown size={22} strokeWidth={2.5} className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} /></span>
              </button>
              <div id={`${sectionId(heading)}-content`} className={`programme-section-collapse grid transition-[grid-template-rows] duration-300 sm:grid-rows-[1fr] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}><div className="overflow-hidden"><div className="card-body"><ProgrammeContent content={content} /></div></div></div>
            </section>;
          }) : <section className="card p-4 text-center text-secondary">More programme information will be published here.</section>}
        </article>
        <aside className="col-lg-4 order-2"><div className="programme-detail-sidebar d-flex flex-column gap-3"><ApplicationPanel programme={programme} configuration={configuration} accent={accent} duration={duration} onAskAi={onAskAi} onViewRequirements={() => scrollToSection('Admission Requirements')} />{sections.length > 1 && <nav aria-label="Explore this programme" className="card d-none d-lg-block p-3"><p className="mb-2 small fw-bold text-uppercase text-secondary">Explore this programme</p><ul className="list-unstyled mb-0">{sections.map(([heading]) => <li key={heading}><button onClick={() => scrollToSection(heading)} className="programme-section-sidebar-link w-100 rounded px-3 py-2 text-start small fw-bold">{heading}</button></li>)}</ul></nav>}<div className="alert alert-primary d-none d-lg-block mb-0"><ShieldCheck size={20} /><p className="mt-2 mb-1 fw-bold">Verified programme record</p><p className="mb-0 small">Published directly from the governed PCS approval workflow.</p></div></div></aside>
      </div>
      <RelatedProgrammes programme={programme} configuration={configuration} accent={accent} onOpen={onOpenProgramme} />
    </main>
    <ProgrammeDetailFooter configuration={configuration} onBack={onClose} onAskAi={onAskAi} />
  </div>;
}

const categoryBands: Record<string, [string, string]> = {
  undergraduate: ['#0E3F73', '#1B5EA9'],
  diploma: ['#114d72', '#167b94'],
  postgraduate: ['#15345f', '#315da0'],
  vocational: ['#704719', '#c67b12'],
};

function durationFromOverview(overview: string): string {
  const match = overview.match(/\b(?:is|lasts?|duration(?:\s+is)?)[\s:]+(?:an?\s+)?(\d+(?:\.\d+)?(?:\s*[½¼¾])?\s*(?:years?|months?|semesters?))\b/i);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').replace(/\b(years?|months?|semesters?)\b/i, (unit) => unit.toLowerCase());
}

function conciseCardOverview(programme: PublicProgramme): string {
  const overview = programme.overview.replace(/\s+/g, ' ').trim();
  if (!overview) return '';

  const isGeneratedSummary = overview.toLowerCase().startsWith(`${programme.name.toLowerCase()} is `)
    && overview.toLowerCase().includes(' programme offered by ');

  return isGeneratedSummary ? '' : overview;
}

function adjustHex(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return '#0E3F73';
  const channels = [0, 2, 4].map((start) => Math.max(0, Math.min(255, Number.parseInt(value.slice(start, start + 2), 16) + amount)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function ProgrammeCard({ programme, configuration, bookmarked, onBookmark, onOpen }: { programme: PublicProgramme; configuration: PublicCatalogueSettings; bookmarked: boolean; onBookmark: () => void; onOpen: () => void }) {
  const meta = appStatus(programme);
  const canApply = ['open', 'closing-soon'].includes(programme.application?.status ?? '');
  const modes = programme.study_modes ?? [];
  const unitColour = programme.faculty_id ? configuration.academicUnitColours[programme.faculty_id] : undefined;
  const band = unitColour ? [adjustHex(unitColour, -22), adjustHex(unitColour, 18)] : (categoryBands[programme.category.toLowerCase()] ?? categoryBands.undergraduate);
  const duration = programme.duration || durationFromOverview(programme.overview);
  const summary = conciseCardOverview(programme);

  return <article className="group relative flex min-h-[470px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl" aria-label={programme.name}>
    <div className="relative min-h-[132px] overflow-hidden px-5 py-5 text-white" style={{ backgroundColor: band[0], backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,.10) 1px, transparent 0), linear-gradient(135deg, ${band[0]}, ${band[1]})`, backgroundSize: '18px 18px, 100% 100%' }}>
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <span className="rounded-full border border-white/15 bg-slate-950/25 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em]">{programme.category}</span>
        {configuration.showBookmarks && <button onClick={onBookmark} aria-label={bookmarked ? `Remove bookmark from ${programme.name}` : `Bookmark ${programme.name}`} className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur ${bookmarked ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-white/25 bg-white/10 text-white hover:bg-white/20'}`}><Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} /></button>}
      </div>
      <GraduationCap size={76} strokeWidth={1.4} className="absolute bottom-2 right-5 text-white/25 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-3deg]" aria-hidden="true" />
      <p className="relative z-[1] mt-7 max-w-[70%] text-2xl font-extrabold tracking-wide">{programme.code}</p>
    </div>

    <div className="flex flex-1 flex-col p-5">
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.tone}`}>{meta.label}</span>
        {programme.is_featured && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700"><Star size={11} fill="currentColor" /> Featured</span>}
      </div>

      <button onClick={onOpen} className="mt-4 text-left"><h3 className="line-clamp-3 text-xl font-extrabold leading-snug text-[#0E3F73] transition-colors group-hover:text-[#1B5EA9]">{programme.name}</h3></button>
      {configuration.showCardDescriptions && summary && <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{summary}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Code</dt><dd className="mt-0.5 font-extrabold text-slate-800">{programme.code}</dd></div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Duration</dt><dd className="mt-0.5 truncate font-extrabold capitalize text-slate-800">{duration || 'Not yet published'}</dd></div>
        {programme.campus && <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Campus / Learning centre</dt><dd className="mt-0.5 truncate font-extrabold text-slate-800">{programme.campus}</dd></div>}
        {modes.length > 0 && <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Study modes</dt><dd className="mt-0.5 truncate font-extrabold text-slate-800">{modes.join(' · ')}</dd></div>}
      </dl>

      <div className="mt-3 rounded-xl border-l-4 border-amber-400 bg-slate-50 px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Academic unit</p><p className="mt-0.5 line-clamp-2 text-xs font-bold leading-5 text-slate-700">{programme.faculty ?? 'Kyambogo University'}</p>{programme.department && <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{programme.department}</p>}</div>

      {programme.application && <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500"><CalendarDays size={14} className="shrink-0 text-[#1B5EA9]" /><span className="truncate">{programme.application.intake}</span><span className="ml-auto shrink-0 font-semibold">Due {readableDate(programme.application.deadline)}</span></div>}

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-4">
        <button onClick={onOpen} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0E3F73] px-3 py-2.5 text-xs font-extrabold text-white hover:bg-[#154A87]">View programme <ArrowRight size={14} /></button>
        {configuration.showApplicationLinks && canApply && <a href={configuration.applicationPortalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100">Apply <ExternalLink size={13} /></a>}
      </div>
    </div>
  </article>;
}

function BookmarkedProgrammesDrawer({
  programmes,
  bookmarkCount,
  loading,
  confirmingClear,
  configuration,
  onClose,
  onBrowse,
  onOpen,
  onRemove,
  onRequestClear,
  onCancelClear,
  onClear,
}: {
  programmes: PublicProgramme[];
  bookmarkCount: number;
  loading: boolean;
  confirmingClear: boolean;
  configuration: PublicCatalogueSettings;
  onClose: () => void;
  onBrowse: () => void;
  onOpen: (programme: PublicProgramme) => void;
  onRemove: (programmeId: string) => void;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onClear: () => void;
}) {
  const unavailableCount = Math.max(0, bookmarkCount - programmes.length);
  return <div className="ky-backdrop-enter fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-[3px]" onClick={onClose}>
    <section className="ky-drawer-enter ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden bg-slate-50 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="bookmarked-title" onClick={(event) => event.stopPropagation()}>
      <header className="relative overflow-hidden bg-[#0b3765] px-5 pb-5 pt-5 text-white sm:px-6 sm:pb-6 sm:pt-6">
        <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border-[28px] border-white/[0.04]" aria-hidden="true" />
        <div className="relative flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-lg shadow-slate-950/15"><Bookmark size={21} fill="currentColor" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="bookmarked-title" className="public-display text-xl font-extrabold sm:text-2xl">Bookmarked programmes</h2>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold text-amber-300">{bookmarkCount} saved</span>
            </div>
            <p className="mt-1.5 max-w-sm text-xs leading-5 text-blue-200">Your personal shortlist for comparing programmes and returning to them quickly.</p>
          </div>
          <button autoFocus onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15" aria-label="Close bookmarked programmes"><X size={19} /></button>
        </div>
        <div className="relative mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-[11px] text-blue-200"><ShieldCheck size={15} className="shrink-0 text-emerald-300" /> Stored privately in this browser on this device.</div>
      </header>

      {confirmingClear && <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 sm:px-6" role="alert">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700"><Trash2 size={17} /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-slate-900">Remove every bookmark?</p><p className="mt-1 text-xs leading-5 text-slate-600">This clears the complete shortlist stored on this device.</p></div>
        </div>
        <div className="mt-3 flex justify-end gap-2"><button onClick={onCancelClear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Keep bookmarks</button><button onClick={onClear} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Clear shortlist</button></div>
      </div>}

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" aria-live="polite">
        {!loading && unavailableCount > 0 && programmes.length > 0 && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900" role="status"><strong>{unavailableCount} saved {unavailableCount === 1 ? 'programme is' : 'programmes are'} unavailable.</strong> It may have been unpublished or may be temporarily unreachable.</div>}
        {loading ? <div className="space-y-4" aria-label="Loading bookmarked programmes">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="h-1 bg-slate-200" /><div className="space-y-3 p-5"><div className="h-4 w-32 rounded bg-slate-100" /><div className="h-6 w-4/5 rounded bg-slate-200" /><div className="h-4 w-2/3 rounded bg-slate-100" /><div className="h-10 rounded-xl bg-slate-100" /></div></div>)}</div>
          : programmes.length === 0 && bookmarkCount > 0 ? <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-14 text-center"><span className="flex h-20 w-20 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700"><WifiOff size={34} /></span><h3 className="public-display mt-6 text-xl font-extrabold text-[#0E3F73]">Saved programmes unavailable</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">They may have been unpublished or the catalogue may be temporarily unreachable. You can try again later or clear the saved list.</p><button onClick={onRequestClear} className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100">Clear unavailable bookmarks</button></div>
          : programmes.length === 0 ? <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-14 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-[#1B5EA9]"><Bookmark size={34} /></span>
            <h3 className="public-display mt-6 text-xl font-extrabold text-[#0E3F73]">Build your programme shortlist</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Select the bookmark icon on a programme card. Everything you save will appear here for quick comparison.</p>
            <button onClick={onBrowse} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0E3F73] px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#154A87]">Explore programmes <ArrowRight size={16} /></button>
          </div>
          : <ul className="space-y-4">{programmes.map((programme) => {
            const status = appStatus(programme);
            const accent = programme.faculty_id ? configuration.academicUnitColours[programme.faculty_id] : undefined;
            const duration = programme.duration || durationFromOverview(programme.overview) || 'Not yet published';
            return <li key={programme.id} className="group overflow-hidden rounded-2xl border border-slate-200 border-t-4 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg" style={{ borderTopColor: accent ?? '#0E3F73' }}>
              <article className="p-4 sm:p-5" aria-label={programme.name}>
                <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#0E3F73]">{programme.category}</span><span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${status.tone}`}>{status.label}</span></div><button onClick={() => onRemove(programme.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${programme.name} from bookmarks`}><Trash2 size={15} /></button></div>
                <button onClick={() => onOpen(programme)} className="mt-3 block w-full text-left"><h3 className="public-display text-lg font-extrabold leading-snug text-[#0E3F73] transition-colors group-hover:text-[#1B5EA9]">{programme.name}</h3></button>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500"><span><strong className="text-slate-700">Code:</strong> {programme.code}</span><span><strong className="text-slate-700">Duration:</strong> {duration}</span>{programme.campus && <span><strong className="text-slate-700">Campus:</strong> {programme.campus}</span>}</div>
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Building2 size={15} className="mt-0.5 shrink-0 text-[#1B5EA9]" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-700">{programme.faculty ?? 'Kyambogo University'}</p>{programme.department && <p className="mt-0.5 truncate text-[10px] text-slate-500">{programme.department}</p>}</div></div>
                <button onClick={() => onOpen(programme)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E3F73] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#154A87]">View programme <ArrowRight size={14} /></button>
              </article>
            </li>;
          })}</ul>}
      </div>

      {!loading && programmes.length > 0 && <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-6"><p className="text-xs text-slate-500"><strong className="text-slate-800">{programmes.length}</strong> in your shortlist</p><div className="flex items-center gap-2"><button onClick={onRequestClear} className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Clear all</button><button onClick={onBrowse} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#0E3F73] hover:bg-blue-50">Continue browsing</button></div></footer>}
    </section>
  </div>;
}

export default function CataloguePage() {
  const { toast } = useToast();
  const [catalogue, setCatalogue] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<PublicProgramme | null>(programmeFromHistory);
  const [detailLoading, setDetailLoading] = useState(() => Boolean(programmeIdFromLocation() && !programmeFromHistory()));
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [confirmClearBookmarks, setConfirmClearBookmarks] = useState(false);
  const [savedProgrammes, setSavedProgrammes] = useState<PublicProgramme[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [bookmarks, setBookmarks] = useState<string[]>(storedBookmarkIds);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const overlayWasOpenRef = useRef(Boolean(selected || showBookmarks));
  const refreshSignatureRef = useRef('');
  refreshSignatureRef.current = `${page}|${search}|${category}|${facultyId}`;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchCatalogue({ page, search, category, facultyId }, controller.signal)
        .then((data) => { setCatalogue(data); setError(''); setHasLoaded(true); })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Catalogue unavailable.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, search, category, facultyId, requestVersion]);
  useBackgroundRefresh(async () => {
    const revision = await fetchCatalogueRevision();
    if (catalogue.meta.revision && revision === catalogue.meta.revision) return;
    const signature = `${page}|${search}|${category}|${facultyId}`;
    const data = await fetchCatalogue({ page, search, category, facultyId }, undefined, true);
    if (refreshSignatureRef.current !== signature) return;
    setCatalogue(data);
    setError('');
    setHasLoaded(true);
    const selectedId = selected?.id ?? null;
    if (selectedId) {
      const refreshedProgramme = await fetchPublicProgramme(selectedId, undefined, true);
      if (selectedIdRef.current !== selectedId) return;
      setSelected(refreshedProgramme);
      if (window.history.state?.kyuProgramme?.id === refreshedProgramme.id) {
        window.history.replaceState({ ...window.history.state, kyuProgramme: refreshedProgramme }, '', window.location.href);
      }
    }
  }, {
    seconds: catalogue.configuration.backgroundRefreshSeconds,
    enabled: catalogue.configuration.backgroundRefreshEnabled && online,
  });
  useEffect(() => {
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > catalogue.meta.lastPage) continue;
      const params = new URLSearchParams({ page: String(targetPage) });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (facultyId) params.set('faculty_id', facultyId);
      void prefetchApi(`/api/v1/catalogue/programmes?${params}`);
    }
  }, [page, catalogue.meta.lastPage, search, category, facultyId]);
  useEffect(() => { try { localStorage.setItem('kyu-catalogue-bookmarks', JSON.stringify(bookmarks)); } catch { /* Bookmarks remain available for this tab. */ } }, [bookmarks]);
  useEffect(() => {
    document.title = selected ? `${selected.name} | Kyambogo University` : 'Programme Catalogue | Kyambogo University';
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement('meta');
      description.name = 'description';
      document.head.appendChild(description);
    }
    description.content = selected
      ? `${selected.name} — published programme information from Kyambogo University.`
      : 'Explore published Kyambogo University programmes, entry requirements and current application opportunities.';
  }, [selected]);
  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let requestNumber = 0;
    const restoreProgramme = (state: unknown, refreshFromApi = false) => {
      const currentRequest = ++requestNumber;
      const programme = (state as { kyuProgramme?: PublicProgramme } | null)?.kyuProgramme;
      setShowBookmarks(false);
      setConfirmClearBookmarks(false);
      if (programme && typeof programme.id === 'string' && !refreshFromApi) {
        setSelected(programme);
        setDetailLoading(false);
        return;
      }
      const programmeId = programmeIdFromLocation();
      if (!programmeId) {
        setSelected(null);
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      fetchPublicProgramme(programmeId, controller.signal)
        .then((record) => {
          if (currentRequest !== requestNumber || controller.signal.aborted) return;
          window.history.replaceState({ ...(window.history.state ?? {}), kyuProgramme: record }, '', window.location.href);
          setSelected(record);
        })
        .catch((reason) => {
          if (currentRequest !== requestNumber || controller.signal.aborted) return;
          window.history.replaceState(catalogueHistoryState(), '', `${window.location.pathname}${window.location.search}`);
          setSelected(null);
          toast(reason instanceof Error ? reason.message : 'That programme link is no longer available.', 'error');
        })
        .finally(() => {
          if (currentRequest === requestNumber && !controller.signal.aborted) setDetailLoading(false);
        });
    };
    const restoreProgrammeFromHistory = (event: PopStateEvent) => restoreProgramme(event.state);
    restoreProgramme(window.history.state, Boolean(programmeIdFromLocation()));
    window.addEventListener('popstate', restoreProgrammeFromHistory);
    return () => { controller.abort(); window.removeEventListener('popstate', restoreProgrammeFromHistory); };
  }, [toast]);
  useEffect(() => {
    if (!showBookmarks || bookmarks.length === 0) { if (!bookmarks.length) setSavedProgrammes([]); return; }
    const controller = new AbortController(); setSavedLoading(true);
    Promise.allSettled(bookmarks.map((id) => fetchPublicProgramme(id, controller.signal))).then((results) => { if (!controller.signal.aborted) setSavedProgrammes(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])); }).finally(() => { if (!controller.signal.aborted) setSavedLoading(false); });
    return () => controller.abort();
  }, [showBookmarks, bookmarks]);
  useEffect(() => {
    if (!selected && !showBookmarks) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected && window.history.state?.kyuProgramme?.id === selected.id && window.history.state?.kyuCatalogueEntry) window.history.back();
      else if (selected) {
        window.history.replaceState(catalogueHistoryState(), '', `${window.location.pathname}${window.location.search}`);
        setSelected(null);
      }
      setShowBookmarks(false);
      setConfirmClearBookmarks(false);
    };
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = previous; };
  }, [selected, showBookmarks]);
  useEffect(() => {
    const overlayIsOpen = Boolean(selected || showBookmarks);
    if (!overlayIsOpen && overlayWasOpenRef.current) {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
    overlayWasOpenRef.current = overlayIsOpen;
  }, [selected, showBookmarks]);

  const filtersActive = Boolean(search || category || facultyId);
  const toggleBookmark = (id: string) => {
    const removing = bookmarks.includes(id);
    toast(removing ? 'Programme removed from bookmarks.' : 'Programme bookmarked on this device.', 'success');
    setBookmarks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const clearBookmarks = () => {
    setBookmarks([]);
    setSavedProgrammes([]);
    setConfirmClearBookmarks(false);
    toast('All programme bookmarks were cleared.', 'info');
  };
  const rememberFocus = () => {
    if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
  };
  const openBookmarks = () => {
    rememberFocus();
    setShowBookmarks(true);
  };
  const openProgramme = (programme: PublicProgramme) => {
    if (!selected && !showBookmarks) rememberFocus();
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = `programme/${encodeURIComponent(programme.id)}`;
    const alreadyViewingProgramme = Boolean(window.history.state?.kyuProgramme);
    const method = alreadyViewingProgramme ? 'replaceState' : 'pushState';
    const openedFromCatalogue = alreadyViewingProgramme ? Boolean(window.history.state?.kyuCatalogueEntry) : true;
    window.history[method]({ ...(window.history.state ?? {}), kyuProgramme: programme, kyuCatalogueEntry: openedFromCatalogue }, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setSelected(programme);
    setShowBookmarks(false);
    setConfirmClearBookmarks(false);
  };
  const closeProgramme = () => {
    if (selected && window.history.state?.kyuProgramme?.id === selected.id) {
      const hasCatalogueEntryBehind = Boolean(window.history.state?.kyuCatalogueEntry);
      if (hasCatalogueEntryBehind && window.location.hash) {
        window.history.back();
        return;
      }
    }
    window.history.replaceState(catalogueHistoryState(), '', `${window.location.pathname}${window.location.search}`);
    setSelected(null);
  };
  const clearFilters = () => { setSearch(''); setCategory(''); setFacultyId(''); setPage(1); };
  const changePage = (next: number) => { setPage(next); document.getElementById('catalogue-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const scrollToCatalogue = () => {
    if (window.location.hash) window.history.replaceState(catalogueHistoryState(), '', `${window.location.pathname}${window.location.search}`);
    document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const returnToTop = () => {
    if (window.location.hash) window.history.replaceState(catalogueHistoryState(), '', `${window.location.pathname}${window.location.search}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const activeFaculty = catalogue.filters.faculties.find((faculty) => faculty.id === facultyId)?.name;
  const firstResult = catalogue.meta.total === 0 ? 0 : ((catalogue.meta.currentPage - 1) * catalogue.meta.perPage) + 1;
  const lastResult = Math.min(catalogue.meta.currentPage * catalogue.meta.perPage, catalogue.meta.total);

  return <div className="public-catalogue min-h-screen bg-[#f6f8fb] text-slate-800">
    <a href="#catalogue" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-[#0E3F73]">Skip to programmes</a>
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b3765]/95 text-white shadow-lg backdrop-blur"><div className="mx-auto flex h-[68px] max-w-7xl items-center px-4 sm:px-6"><Link to="/" onClick={returnToTop} className="flex min-w-0 items-center gap-3"><Logo /><div className="min-w-0"><p className="public-display truncate text-sm font-bold sm:text-base">Kyambogo University</p><p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300 sm:text-[10px]">Programme Catalogue</p></div></Link><nav className="ml-auto hidden items-center gap-1 text-sm md:flex"><button onClick={scrollToCatalogue} aria-current="page" className="rounded-lg bg-white/10 px-3 py-2 font-semibold text-amber-300">Explore</button><button onClick={() => setAiOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10"><Bot size={16} /> Ask AI</button>{catalogue.configuration.showBookmarks && <button onClick={openBookmarks} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10"><Bookmark size={15} /> Bookmarked <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{bookmarks.length}</span></button>}</nav><button onClick={() => setMobileOpen((open) => !open)} className="ml-auto rounded-xl p-2 hover:bg-white/10 md:hidden" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label="Toggle navigation">{mobileOpen ? <X /> : <Menu />}</button></div>
      {mobileOpen && <nav id="mobile-navigation" className="border-t border-white/10 px-4 py-3 text-sm md:hidden"><button onClick={() => { scrollToCatalogue(); setMobileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-amber-300"><Search size={17} /> Explore programmes</button><button onClick={() => { setAiOpen(true); setMobileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10"><Bot size={17} /> Ask the programme assistant</button>{catalogue.configuration.showBookmarks && <button onClick={() => { openBookmarks(); setMobileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10"><Bookmark size={17} /> Bookmarked programmes ({bookmarks.length})</button>}</nav>}
    </header>

    <section className="catalogue-hero relative overflow-hidden bg-[#0E3F73] text-white"><div className="relative mx-auto max-w-7xl px-4 pb-12 pt-11 sm:px-6 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20"><div className="max-w-3xl"><p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-amber-300"><CheckCircle2 size={14} /> {catalogue.configuration.heroBadge}</p><h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{catalogue.configuration.heroTitle}<br /><span className="text-amber-300">{catalogue.configuration.heroAccent}</span></h1><p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base sm:leading-7">{catalogue.configuration.heroDescription}</p></div><button onClick={scrollToCatalogue} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-amber-300">Find your programme <ArrowRight size={17} /></button>{catalogue.configuration.showHeroStatistics && <dl className="mt-10 grid max-w-2xl grid-cols-3 divide-x divide-white/15 border-t border-white/15 pt-6"><div className="pr-3"><dd className="text-2xl font-extrabold sm:text-3xl">{hasLoaded ? catalogue.summary.publishedProgrammes : '—'}</dd><dt className="mt-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 sm:text-[10px]">Programmes</dt></div><div className="px-4 sm:px-7"><dd className="text-2xl font-extrabold sm:text-3xl">{hasLoaded ? catalogue.summary.academicUnits : '—'}</dd><dt className="mt-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 sm:text-[10px]">Academic units</dt></div><div className="pl-4 sm:pl-7"><dd className="text-2xl font-extrabold text-amber-300 sm:text-3xl">{hasLoaded ? catalogue.summary.callsClosingSoon : '—'}</dd><dt className="mt-1 text-[9px] font-bold uppercase tracking-wider text-blue-200 sm:text-[10px]">Closing soon</dt></div></dl>}</div></section>

    <main id="catalogue" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-8 sm:px-6 sm:py-10">
      {!online && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status"><WifiOff size={19} className="mt-0.5 shrink-0" /><div><p className="font-bold">You appear to be offline</p><p className="mt-0.5 text-xs leading-5 text-amber-800">Previously displayed information may remain visible. Reconnect to search or load other programmes.</p></div></div>}
      <div className="mb-6 flex items-end justify-between gap-4"><div><p data-reveal="from-right" className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Explore your options</p><h2 data-reveal="from-left" className="mt-1 text-2xl font-extrabold text-[#0E3F73] sm:text-3xl">Find the right programme</h2></div><button onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-[#0E3F73] shadow-sm md:hidden" aria-expanded={filtersOpen}><Filter size={17} /> Filters{(category || facultyId) && <span className="h-2 w-2 rounded-full bg-amber-500" />}</button></div>
      <section className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="relative block"><span className="mb-2 block text-xs font-bold text-slate-700">Search programmes</span><Search size={19} className="absolute bottom-3.5 left-3.5 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Try a programme name, code or academic unit" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm outline-none transition focus:border-[#1B5EA9] focus:bg-white focus:ring-4 focus:ring-blue-100" />{search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute bottom-2.5 right-2.5 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Clear search"><X size={17} /></button>}</label>
        <div className={`${filtersOpen ? 'grid' : 'hidden'} mt-4 gap-3 md:grid md:grid-cols-2`}>
          <CatalogueFilterDropdown label="Academic unit" value={facultyId} allLabel="All faculties & schools" icon={<Building2 size={17} />} options={catalogue.filters.faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))} onChange={(nextValue) => { setFacultyId(nextValue); setPage(1); }} />
          <CatalogueFilterDropdown label="Study level" value={category} allLabel="All programme levels" icon={<GraduationCap size={18} />} options={catalogue.filters.categories.map((item) => ({ value: item, label: item }))} onChange={(nextValue) => { setCategory(nextValue); setPage(1); }} />
        </div>
        {catalogue.filters.categories.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap" aria-label="Browse by study level"><button onClick={() => { setCategory(''); setPage(1); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${!category ? 'border-[#0E3F73] bg-[#0E3F73] text-white' : 'border-slate-200 text-slate-600'}`}>All levels</button>{catalogue.filters.categories.map((item) => <button key={item} onClick={() => { setCategory(item); setPage(1); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${category === item ? 'border-[#0E3F73] bg-[#0E3F73] text-white' : 'border-slate-200 text-slate-600'}`}>{item}</button>)}</div>}
      </section>
      {filtersActive && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters"><span className="text-xs font-bold text-slate-500">Active:</span>{search && <button onClick={() => { setSearch(''); setPage(1); }} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">Search: “{search}” <X size={13} /></button>}{activeFaculty && <button onClick={() => { setFacultyId(''); setPage(1); }} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">{activeFaculty} <X size={13} /></button>}{category && <button onClick={() => { setCategory(''); setPage(1); }} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">{category} <X size={13} /></button>}<button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"><RefreshCw size={13} /> Reset all</button></div>}

      <section id="catalogue-results" className="scroll-mt-24" aria-live="polite" aria-busy={loading}><div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-500">Showing <strong className="text-slate-900">{firstResult}–{lastResult}</strong> of <strong className="text-slate-900">{catalogue.meta.total}</strong> {catalogue.meta.total === 1 ? 'programme' : 'programmes'}</p>{filtersActive && <p className="mt-0.5 text-xs text-slate-400">Results update as you search or filter.</p>}</div><div className="flex items-center gap-3">{loading && hasLoaded && <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><LoaderCircle size={14} className="animate-spin" /> Updating results</span>}{filtersActive && <button onClick={clearFilters} className="rounded-lg px-2 py-1 text-xs font-bold text-[#1B5EA9] hover:bg-blue-50">Clear all</button>}</div></div>
        {error && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><div><p className="font-bold">{online ? 'The catalogue could not be updated' : 'No internet connection'}</p><p className="mt-1 text-xs leading-5">{online ? error : 'Reconnect to the internet, then try loading the catalogue again.'}</p></div><button disabled={!online} onClick={() => setRequestVersion((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={14} /> Try again</button></div>}
        {!hasLoaded && loading ? <div className="grid gap-5 py-7 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[470px] animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="h-[132px] bg-slate-200" /><div className="space-y-4 p-5"><div className="h-6 w-28 rounded-full bg-slate-100" /><div className="h-6 w-4/5 rounded bg-slate-200" /><div className="h-3 w-full rounded bg-slate-100" /><div className="h-3 w-5/6 rounded bg-slate-100" /><div className="grid grid-cols-2 gap-2"><div className="h-14 rounded-xl bg-slate-100" /><div className="h-14 rounded-xl bg-slate-100" /></div><div className="h-16 rounded-xl bg-slate-100" /></div></div>)}</div> : catalogue.programmes.length === 0 ? <div className="my-7 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><Search className="mx-auto text-slate-300" size={38} /><h3 className="mt-4 font-bold text-slate-800">No matching programmes</h3><p className="mx-auto mt-2 max-w-sm px-4 text-sm leading-6 text-slate-500">Try a shorter search, another study level, or clear the current filters.</p>{filtersActive && <button onClick={clearFilters} className="mt-5 rounded-xl bg-[#0E3F73] px-4 py-2.5 text-sm font-bold text-white">Clear filters</button>}</div> : <div className="grid min-h-[470px] gap-5 py-7 sm:grid-cols-2 lg:grid-cols-3">{catalogue.programmes.map((programme) => <ProgrammeCard key={programme.id} programme={programme} configuration={catalogue.configuration} bookmarked={bookmarks.includes(programme.id)} onBookmark={() => toggleBookmark(programme.id)} onOpen={() => openProgramme(programme)} />)}</div>}
        {catalogue.meta.lastPage > 1 && <div className="border-t border-slate-200 py-8"><PageNumbers current={catalogue.meta.currentPage} last={catalogue.meta.lastPage} onChange={changePage} /></div>}
      </section>
      <section className="my-8 overflow-hidden rounded-3xl bg-[#0E3F73] px-5 py-8 text-white sm:px-8 sm:py-10"><div className="grid items-center gap-6 md:grid-cols-[1fr_auto]"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-300"><Sparkles size={15} /> Need guidance?</p><h2 className="mt-2 text-2xl font-extrabold">Ask the programme assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Compare options and find published entry requirements or career information in plain language.</p></div><button onClick={() => setAiOpen(true)} className="inline-flex w-fit items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300"><Bot size={17} /> Start a conversation</button></div></section>
    </main>

    <footer className="relative overflow-hidden bg-[#082f59] text-blue-100" aria-label="Public catalogue footer">
      <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full border-[44px] border-white/[0.025]" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-11 sm:px-6 sm:py-14">
        <div className="grid gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1.15fr] lg:gap-8">
          <section>
            <div className="flex items-center gap-3">
              <Logo />
              <div>
                <h2 className="public-display text-base font-bold text-white">{UNIVERSITY.name}</h2>
                <p className="text-xs font-semibold text-amber-300">{UNIVERSITY.motto}</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-blue-200">Explore verified programmes, official admission requirements and current application opportunities in one trusted catalogue.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200">
              <ShieldCheck size={14} /> Official university information
            </div>
          </section>

          <nav aria-label="Explore catalogue">
            <h2 className="public-display text-sm font-bold text-white">Explore</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><button onClick={scrollToCatalogue} className="inline-flex items-center gap-2 text-left transition hover:text-amber-300"><BookOpen size={15} /> Programmes</button></li>
              <li><button onClick={() => setAiOpen(true)} className="inline-flex items-center gap-2 text-left transition hover:text-amber-300"><Bot size={15} /> Ask AI</button></li>
              {catalogue.configuration.showBookmarks && <li><button onClick={openBookmarks} className="inline-flex items-center gap-2 text-left transition hover:text-amber-300"><Bookmark size={15} /> Bookmarked ({bookmarks.length})</button></li>}
            </ul>
          </nav>

          <nav aria-label="University portals">
            <h2 className="public-display text-sm font-bold text-white">Useful links</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {catalogue.configuration.showApplicationLinks && <li><a href={catalogue.configuration.applicationPortalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-amber-300">Apply online <ExternalLink size={13} /></a></li>}
              <li><a href={UNIVERSITY.studentPortal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-amber-300">Student portal <ExternalLink size={13} /></a></li>
            </ul>
          </nav>

          <section>
            <h2 className="public-display text-sm font-bold text-white">Contact the university</h2>
            <address className="mt-4 space-y-3 text-sm not-italic leading-5">
              <p className="flex items-start gap-2.5"><MapPin size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.address}</span></p>
              <a href="tel:+256414285037" className="flex items-start gap-2.5 transition hover:text-amber-300"><Phone size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.phone}</span></a>
              <a href={`mailto:${UNIVERSITY.email}`} className="flex items-start gap-2.5 break-all transition hover:text-amber-300"><Mail size={16} className="mt-0.5 shrink-0 text-amber-300" /><span>{UNIVERSITY.email}</span></a>
            </address>
          </section>
        </div>

        <div className="flex flex-col gap-4 pt-6 text-xs text-blue-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p>© {new Date().getFullYear()} {UNIVERSITY.name}. All rights reserved.</p>
            <p className="mt-1 text-blue-400">Programme information is published through the governed KYU PCS workflow.</p>
          </div>
          <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-bold text-white transition hover:border-amber-300/40 hover:bg-white/10 hover:text-amber-300">
            Back to top <ArrowUp size={14} />
          </a>
        </div>
      </div>
    </footer>

    {detailLoading && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f6f8fb]" role="status" aria-live="polite"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-[#0E3F73] shadow-xl"><LoaderCircle size={20} className="animate-spin" /> Loading programme details…</div></div>}
    {selected && <ProgrammeDetails key={selected.id} programme={selected} configuration={catalogue.configuration} bookmarked={bookmarks.includes(selected.id)} onBookmark={() => toggleBookmark(selected.id)} onClose={closeProgramme} onAskAi={() => setAiOpen(true)} onOpenProgramme={openProgramme} />}
    {catalogue.configuration.showBookmarks && showBookmarks && <BookmarkedProgrammesDrawer
      programmes={savedProgrammes}
      bookmarkCount={bookmarks.length}
      loading={savedLoading}
      confirmingClear={confirmClearBookmarks}
      configuration={catalogue.configuration}
      onClose={() => { setShowBookmarks(false); setConfirmClearBookmarks(false); }}
      onBrowse={() => { setShowBookmarks(false); setConfirmClearBookmarks(false); scrollToCatalogue(); }}
      onOpen={openProgramme}
      onRemove={toggleBookmark}
      onRequestClear={() => setConfirmClearBookmarks(true)}
      onCancelClear={() => setConfirmClearBookmarks(false)}
      onClear={clearBookmarks}
    />}
    <Suspense fallback={null}><PublicAiWidget open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} programme={selected} /></Suspense>
  </div>;
}
