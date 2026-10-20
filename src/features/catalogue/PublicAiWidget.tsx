import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, Copy, Download, Maximize2, RefreshCw, Send, Share2, ShieldCheck, ThumbsDown, ThumbsUp, Trash2, WifiOff, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import kyuLogo from '../../assets/kyu-logo.png';
import type { PublicProgramme } from './types';
import {
  askAssistant, fetchAssistantConfiguration, saveAssistantFeedback,
  type AssistantConfiguration, type HistoryTurn,
} from './publicAiService';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  disclaimer?: string | null;
  turnId?: number;
  feedback?: 'like' | 'dislike' | null;
  error?: boolean;
}

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  programme?: PublicProgramme | null;
}

const HISTORY_KEY = 'kyu-ai-chat-history-v1';
const CLIENT_KEY = 'kyu-ai-client-id';
const TEASER_KEY = 'kyu-ai-teaser-seen-v1';
const TEASER_SNOOZE = 3 * 24 * 60 * 60 * 1000;
const teasers = ['Lost in the programme list? I can help.', 'Not sure which programme fits? Ask me.', 'Hello! Would you like help finding a programme?'];

const defaults: AssistantConfiguration = {
  status: 'online',
  bot_name: 'Programme Navigation Assistant',
  greeting: 'Hello! Ask me about programmes, entry requirements or career prospects.',
  suggestions: ['Which programmes are available?', 'What are the entry requirements?', 'Help me compare programme options'],
  accent_color: '#1B5EA9',
  history_turns: 8,
  profile_avatar: null,
};

function getClientId() {
  try {
    const stored = localStorage.getItem(CLIENT_KEY);
    if (stored && /^[a-zA-Z0-9-]{8,64}$/.test(stored)) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch { return `visitor-${Date.now()}`; }
}

function loadHistory(): Message[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.slice(-40).flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const message = entry as Partial<Message>;
      if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string') return [];
      return [{ ...message, role: message.role, text: message.role === 'assistant' ? normalizeAssistantMarkdown(message.text) : message.text } as Message];
    });
  } catch { return []; }
}

function initialTeaser() {
  try { return Date.now() - Number(localStorage.getItem(TEASER_KEY) ?? 0) > TEASER_SNOOZE; }
  catch { return true; }
}

function rememberTeaser() {
  try { localStorage.setItem(TEASER_KEY, String(Date.now())); } catch { /* Storage is optional. */ }
}

function timeGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function normalizeAssistantMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, '**$2**')
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, '*$2*')
    .replace(/<\/?[^>]+>/g, '');
}

function MarkdownTable(props: ComponentPropsWithoutRef<'table'>) {
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);
  useEffect(() => {
    if (!expanded) {
      if (wasExpandedRef.current) window.requestAnimationFrame(() => expandButtonRef.current?.focus());
      return;
    }
    wasExpandedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [expanded]);
  return <>
    <div className="relative my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table {...props} className="w-full min-w-[300px] border-collapse text-left text-xs" />
      <button ref={expandButtonRef} onClick={() => setExpanded(true)} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-500 shadow-sm hover:text-blue-700" aria-label="Expand table"><Maximize2 size={13} /></button>
    </div>
    {expanded && createPortal(
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-[2px] sm:p-5" onClick={() => setExpanded(false)}>
        <section
          className="ai-markdown flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded programme information table"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setExpanded(false);
          }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5"><img src={kyuLogo} alt="Kyambogo University crest" className="h-10 w-10 shrink-0 object-contain" /><strong className="flex-1 text-slate-900">Programme information</strong><button autoFocus onClick={() => setExpanded(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" aria-label="Close expanded table"><X size={18} /></button></header>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5"><table {...props} className="w-full min-w-[720px] border-collapse text-left text-sm" /></div>
        </section>
      </div>,
      document.body,
    )}
  </>;
}

function Answer({ text }: { text: string }) {
  return <div className="ai-markdown break-words text-sm leading-6 text-slate-800">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ table: MarkdownTable }}>{normalizeAssistantMarkdown(text)}</ReactMarkdown>
  </div>;
}

export default function PublicAiWidget({ open, onOpen, onClose, programme }: Props) {
  const [configuration, setConfiguration] = useState(defaults);
  const [configurationError, setConfigurationError] = useState('');
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showTeaser, setShowTeaser] = useState(initialTeaser);
  const [teaser] = useState(() => teasers[Math.floor(Math.random() * teasers.length)]);
  const endRef = useRef<HTMLDivElement>(null);
  const anonymousId = useRef(getClientId());

  const loadConfiguration = () => {
    setConfigurationError('');
    fetchAssistantConfiguration()
      .then((value) => setConfiguration({ ...defaults, ...value }))
      .catch(() => {
        setConfiguration((current) => ({ ...current, status: 'offline' }));
        setConfigurationError('The assistant configuration could not be loaded.');
      });
  };
  useEffect(loadConfiguration, []);
  useEffect(() => { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.filter((message) => message.text).slice(-40))); } catch { /* Chat still works without storage. */ } }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 639px)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const openWidget = () => { setShowTeaser(false); rememberTeaser(); onOpen(); };
  const dismissTeaser = () => { setShowTeaser(false); rememberTeaser(); };

  const send = async (suggestion?: string) => {
    const question = (suggestion ?? input).trim();
    if (!question || sending) return;
    const previous = messages.filter((message) => !message.error).slice(-(configuration.history_turns * 2));
    setMessages((current) => [...current, { role: 'user', text: question }, { role: 'assistant', text: '' }]);
    setInput('');
    setSending(true);
    try {
      const result = await askAssistant({
        question,
        clientId: anonymousId.current,
        programmeId: programme?.id,
        history: previous.map(({ role, text }) => ({ role, text })) as HistoryTurn[],
        onDelta: (answer) => setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, text: normalizeAssistantMarkdown(answer) } : message)),
      });
      setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, text: normalizeAssistantMarkdown(result.answer.trim()), disclaimer: result.disclaimer, turnId: result.turn_id } : message));
    } catch (reason) {
      setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, text: reason instanceof Error ? reason.message : 'The assistant is unavailable.', error: true } : message));
    } finally { setSending(false); }
  };

  const feedback = async (index: number, value: 'like' | 'dislike') => {
    const message = messages[index];
    if (!message.turnId) return;
    const next = message.feedback === value ? null : value;
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedback: next } : item));
    try { await saveAssistantFeedback(message.turnId, anonymousId.current, next); } catch { /* Feedback is optional. */ }
  };

  const share = async (message: Message) => {
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    if (typeof nativeShare === 'function') {
      try { await nativeShare.call(navigator, { title: configuration.bot_name, text: message.text }); } catch { /* The visitor cancelled sharing. */ }
      return;
    }
    const file = new Blob([message.text], { type: 'text/plain' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = 'kyu-programme-answer.txt'; link.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => { setMessages([]); try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* Optional. */ } };
  const accent = configuration.accent_color;
  const visibleSuggestions = programme ? [
    `Summarise ${programme.name}`,
    `What are the entry requirements for ${programme.code}?`,
    `What career opportunities follow ${programme.code}?`,
  ] : configuration.suggestions;

  if (!open) return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
    {showTeaser && <div className="relative max-w-[230px] rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-xl"><button onClick={dismissTeaser} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-white shadow" style={{ backgroundColor: accent }} aria-label="Dismiss assistant message"><X size={13} /></button><button onClick={openWidget} className="text-left">{teaser}</button></div>}
    <button onClick={openWidget} className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition hover:-translate-y-0.5" style={{ backgroundColor: accent }} aria-label="Open programme assistant"><Bot size={26} /></button>
  </div>;

  return <section className="ky-drawer-enter fixed inset-0 z-[120] flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(518px,calc(100vh-40px))] sm:w-[340px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200" role="dialog" aria-modal="true" aria-label={configuration.bot_name}>
    <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: accent }}><img src={configuration.profile_avatar || kyuLogo} alt={configuration.profile_avatar ? `${configuration.bot_name} avatar` : 'Kyambogo University crest'} className={configuration.profile_avatar ? 'h-10 w-10 shrink-0 rounded-lg object-cover' : 'h-11 w-11 shrink-0 object-contain'} /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{configuration.bot_name}</h2><p className="truncate text-[11px] text-white/75">{programme ? `Focused on ${programme.name}` : 'Published catalogue information only'}</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close assistant"><X size={20} /></button></header>

    <div className="flex-1 space-y-3 overflow-y-auto bg-white p-4" aria-live="polite" aria-busy={sending}>
      {messages.length === 0 && <div className="flex min-h-full flex-col items-center justify-center text-center"><Bot size={32} style={{ color: accent }} /><h3 className="mt-3 text-sm font-bold text-slate-900">{timeGreeting()}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-slate-600">{configuration.greeting}</p>{programme && <p className="mt-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Questions are scoped to {programme.code}</p>}<div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><ShieldCheck size={12} /> Answers use published catalogue information</div>{configurationError ? <div className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"><div className="flex gap-2"><WifiOff size={16} className="shrink-0 text-amber-700" /><div><p className="text-xs font-bold text-amber-900">Assistant temporarily unavailable</p><p className="mt-1 text-[11px] leading-4 text-amber-800">{configurationError}</p></div></div><button onClick={loadConfiguration} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-900 shadow-sm"><RefreshCw size={12} /> Try again</button></div> : <div className="mt-4 w-full space-y-2">{visibleSuggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50">{suggestion}</button>)}</div>}</div>}
      {messages.map((message, index) => <div key={`${index}-${message.turnId ?? 'local'}`} className={`ky-message-enter ${message.role === 'user' ? 'ml-auto max-w-[82%]' : 'mr-auto max-w-[92%]'}`}><div className={message.role === 'user' ? 'whitespace-pre-wrap rounded-[18px] rounded-br-sm bg-slate-100 px-4 py-2.5 text-sm leading-6 text-slate-800' : message.error ? 'rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700' : 'px-0.5 py-2'}>{message.role === 'assistant' && !message.error ? <Answer text={message.text} /> : message.text}</div>{message.disclaimer && <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-blue-50 px-2 py-1.5 text-[10px] leading-4 text-blue-700"><ShieldCheck size={11} className="mt-0.5 shrink-0" /><span>{message.disclaimer}</span></div>}{message.role === 'assistant' && !message.error && <div className="mt-0.5 flex items-center gap-0.5"><button onClick={() => { void navigator.clipboard.writeText(message.text); setCopied(index); window.setTimeout(() => setCopied(null), 1500); }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Copy answer">{copied === index ? <Check size={14} /> : <Copy size={14} />}</button><button onClick={() => void share(message)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Share or download answer">{typeof (navigator as unknown as { share?: unknown }).share === 'function' ? <Share2 size={14} /> : <Download size={14} />}</button><button onClick={() => void feedback(index, 'dislike')} className={`rounded p-1.5 hover:bg-slate-100 ${message.feedback === 'dislike' ? 'text-amber-600' : 'text-slate-400'}`} aria-label="Unhelpful answer"><ThumbsDown size={14} fill={message.feedback === 'dislike' ? 'currentColor' : 'none'} /></button><button onClick={() => void feedback(index, 'like')} className={`rounded p-1.5 hover:bg-slate-100 ${message.feedback === 'like' ? 'text-amber-600' : 'text-slate-400'}`} aria-label="Helpful answer"><ThumbsUp size={14} fill={message.feedback === 'like' ? 'currentColor' : 'none'} /></button></div>}</div>)}
      {sending && <div className="mr-auto px-1 py-3"><span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:240ms]" /></span></div>}
      <div ref={endRef} />
    </div>

    <div className="border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5"><div className="flex items-center gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} maxLength={2000} aria-label="Question for the programme assistant" placeholder={configuration.status === 'online' ? 'Ask about any programme…' : 'Assistant unavailable'} disabled={sending || configuration.status !== 'online'} className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50" /><button disabled={sending || !input.trim() || configuration.status !== 'online'} onClick={() => void send()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ backgroundColor: accent }} aria-label="Send question"><Send size={16} /></button></div><div className="mt-1.5 flex min-h-4 items-center justify-between gap-2 text-[10px] text-slate-400"><span>{messages.length > 0 ? <button onClick={clearHistory} className="flex items-center gap-1 hover:text-red-600"><Trash2 size={11} /> Clear conversation</button> : 'Press Enter to send'}</span><span>{input.length}/2000</span></div></div>
  </section>;
}
