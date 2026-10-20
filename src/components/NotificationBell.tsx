import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BookOpenCheck, CalendarClock, CheckCheck, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { fetchNotifications, type NotificationType, type PortalNotification } from '../services/notificationService';
import { useBackgroundRefresh } from '../hooks/useBackgroundRefresh';

const icons = {
  review: BookOpenCheck,
  warning: TriangleAlert,
  deadline: CalendarClock,
  security: ShieldAlert,
} satisfies Record<NotificationType, typeof Bell>;

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<PortalNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const storageKey = `kyu-notification-read:${user?.id ?? 'anonymous'}`;

  useEffect(() => {
    try { setReadIds(JSON.parse(localStorage.getItem(storageKey) ?? '[]')); }
    catch { setReadIds([]); }
  }, [storageKey]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    return fetchNotifications(signal)
      .then((data) => { setNotes(data); setError(''); })
      .catch((reason) => {
        if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.');
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialTimer = window.setTimeout(() => void load(controller.signal), 1500);
    return () => { controller.abort(); window.clearTimeout(initialTimer); };
  }, [load]);

  useBackgroundRefresh(async () => {
    const data = await fetchNotifications();
    setNotes(data);
    setError('');
  }, 'operational');

  const unread = useMemo(() => notes.filter((note) => !readIds.includes(note.id)).length, [notes, readIds]);
  const saveRead = (ids: string[]) => {
    const next = Array.from(new Set([...readIds, ...ids])).slice(-200);
    setReadIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  };

  const openNote = (note: PortalNotification) => {
    saveRead([note.id]);
    setOpen(false);
    navigate(note.path);
  };

  return (
    <div className="relative">
      <button onClick={() => { const next = !open; setOpen(next); if (next && notes.length === 0 && !loading) void load(); }} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-kyu-orange px-0.5 text-[10px] font-bold text-[#0B1F3A]">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="fixed left-3 right-3 top-16 z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div><p className="text-sm font-bold text-gray-700">Notifications</p><p className="text-[10px] text-gray-400">Live tasks and security alerts in your scope</p></div>
            {unread > 0 && <button onClick={() => saveRead(notes.map((note) => note.id))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-kyu-blue hover:underline"><CheckCheck size={12} /> Mark all read</button>}
          </div>
          {loading && notes.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Loading notifications…</p>
            : error ? <div className="flex items-center justify-between gap-3 px-4 py-5"><p className="text-xs text-red-600">{error}</p><button onClick={() => void load()} className="inline-flex items-center gap-1 text-xs font-semibold text-kyu-blue"><RefreshCw size={12} /> Retry</button></div>
              : notes.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing requires your attention right now.</p>
                : <ul className="max-h-96 divide-y divide-gray-50 overflow-y-auto">{notes.map((note) => {
                  const Icon = icons[note.type];
                  const read = readIds.includes(note.id);
                  return <li key={note.id}><button onClick={() => openNote(note)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50 ${read ? 'opacity-60' : ''}`}>
                    <Icon size={16} className="mt-0.5 shrink-0 text-kyu-blue" />
                    <span className="min-w-0 flex-1"><span className="block text-xs text-gray-700">{note.text}</span><span className="mt-0.5 block text-[10px] text-gray-400">{relativeTime(note.occurred_at)}</span></span>
                    {!read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-kyu-orange" />}
                  </button></li>;
                })}</ul>}
        </div>
      </>}
    </div>
  );
}
