import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown"; // renders the AI's markdown (tables, bold, lists, code)
// the crest, inlined as a data URL so the embed needs no asset files
import remarkGfm from "remark-gfm"; // GitHub-flavored markdown -> real tables
import remarkBreaks from "remark-breaks"; // single line breaks -> <br>, like ChatGPT

/**
 * ============================================================================
 *  ChatWidget — THE CHAT BUBBLE YOU SEE ON THE PAGE
 * ============================================================================
 *  What it does:
 *    - Shows a floating blue bubble (bottom-right). Tapping it opens the
 *      chat panel.
 *    - On DESKTOP the panel is a fixed 340x480 box above the bubble.
 *    - On MOBILE (screen narrower than 640px) the panel goes FULL-SCREEN.
 *    - Messages are sent to the backend (POST /api/chat.php) and the reply
 *      arrives as a stream (Server-Sent Events), so the answer is "typed
 *      out" word-by-word like ChatGPT.
 *    - The conversation is kept only for the current browser tab
 *      (sessionStorage) and is removed when that tab is closed.
 *
 *  Where to make common changes:
 *    - Text of the teaser / suggestions  -> constants at the top
 *    - Mobile breakpoint                -> MOBILE_QUERY
 *    - Colors, sizes, spacing           -> the styles object at the bottom
 *    - How messages are sent/parsed     -> sendMessage() below
 * ============================================================================
 */

// ---- config -----------------------------------------------------------
// Where the assistant's brain lives.
//   - On this dev server: relative /api paths (Vite proxies them to PHP).
//   - Embedded on someone else's page: the host sets
//     window.KYAMBOGO_CHAT = { apiBase: "http://192.168.1.81:8080" }
//     and the widget calls the admin's backend directly (CORS-enabled).
const crestUrl = "data:image/png;base64,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";
const EMBED_CFG = typeof window !== "undefined" ? window.KYAMBOGO_CHAT : undefined;
const CHAT_ENDPOINT = EMBED_CFG?.apiBase ? `${EMBED_CFG.apiBase}/chat_api.php` : "/api/chat.php";
const FEEDBACK_ENDPOINT = EMBED_CFG?.apiBase ? `${EMBED_CFG.apiBase}/feedback_api.php` : "/api/feedback_api.php";
const SETTINGS_ENDPOINT = EMBED_CFG?.apiBase ? `${EMBED_CFG.apiBase}/public_settings_api.php` : "/api/public_settings_api.php";
const CLIENT_ID_KEY = "pcs_client_id_v1"; // localStorage key for the anonymous per-browser id
const HISTORY_KEY = "pcs_ai_chat_history_v1"; // sessionStorage key for this tab's conversation
const TEASER_SEEN_KEY = "pcs_ai_teaser_seen_v1"; // localStorage key remembering when the teaser last showed
const TEASER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // re-show teaser after 3 days (in milliseconds)
const MOBILE_QUERY = "(max-width: 640px)"; // screens narrower than this count as "mobile" (full-screen panel)
const TEASER_TEXTS = [
  "Lost in the course list? I can help.",
  "Not sure which programme fits? Ask me.",
  "Hi! Want help finding your programme?",
]; // one is picked at random each load — add/remove lines here freely
const SUGGESTIONS = [
  "What are the entry requirements for BSc Computer Science?",
  "Compare BSc IT and BSc Software Engineering",
  "What careers can I pursue with a Computer Science degree?",
]; // the clickable chips shown when the chat is empty
const ERROR_FALLBACK =
  "Sorry, I couldn't reach the assistant just now. Please try again in a moment.";

// A random id generated once per browser and kept in localStorage. It lets
// the analysis tool correlate chat turns and feedback WITHOUT identifying
// anyone (FR3.12 - no PII).
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// "Good morning / afternoon / evening" based on the visitor's local clock.
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Read this tab's conversation from sessionStorage. Wrapped in try/catch
// because storage can be disabled or full — then we just start empty.
function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Save the conversation only for the lifetime of this browser tab.
function saveHistory(messages) {
  try {
    // keep it bounded - only the last 40 turns need to live on the device;
    // strip transient streaming flags so a reload never shows a stuck "typing"
    const clean = messages
      .slice(-40)
      .map((m) => ({ role: m.role, text: m.text, disclaimer: m.disclaimer || null, liked: !!m.liked, disliked: !!m.disliked, ts: m.ts }));
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(clean));
  } catch {
    /* storage full or unavailable - fail silently, chat still works */
  }
}

// Small hook that re-renders the widget whenever the screen crosses the
// mobile breakpoint (e.g. rotating a phone, resizing a browser window).
function useIsMobile(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// programmeId: optional, pass the current programme's id/slug when the
// widget is mounted on a profile page so questions can be scoped to it.
// userName: optional, only pass this if you actually have an authenticated
// name available (most applicants browsing the catalogue won't have one).
export default function ChatWidget({ programmeId = null, userName = null }) {
  // Console-managed branding (Settings page). Fetched once on mount; the
  // built-in defaults below keep the widget working if the console is down.
  const [widgetSettings, setWidgetSettings] = useState({
    accent: "#1B5EA9",
    botName: "Programme assistant",
    greeting: "What can I help with?",
    historyTurns: 8,
    suggestions: null, // null = use the built-in defaults
    badge: null,       // widget badge image (console-managed), null = crest
  });
  useEffect(() => {
    fetch(`${SETTINGS_ENDPOINT}?endpoint=get`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.settings ?? {};
        setWidgetSettings({
          accent: s.accent_color || "#1B5EA9",
          botName: s.bot_name || "Programme assistant",
          greeting: s.greeting || "What can I help with?",
          historyTurns: Math.max(1, Math.min(20, Number(s.history_turns) || 8)),
          suggestions: s.suggestions
            ? s.suggestions.split("\n").map((t) => t.trim()).filter(Boolean)
            : null,
          badge: s.profile_avatar || null,
        });
      })
      .catch(() => {}); // keep defaults — branding only
  }, []);

  const [isOpen, setIsOpen] = useState(false); // is the chat panel open?
  const [showTeaser, setShowTeaser] = useState(false); // is the teaser bubble visible?
  const [teaserText] = useState(
    () => TEASER_TEXTS[Math.floor(Math.random() * TEASER_TEXTS.length)]
  ); // random teaser line, picked once when the widget mounts
  const [messages, setMessages] = useState(loadHistory); // the conversation
  const [input, setInput] = useState(""); // text currently typed in the box
  const [sending, setSending] = useState(false); // true while a request is in flight
  const [copiedIdx, setCopiedIdx] = useState(null); // which answer just got copied (shows a checkmark briefly)
  const scrollRef = useRef(null); // points at the messages area, used to auto-scroll
  const isMobile = useIsMobile(MOBILE_QUERY);

  // teaser: show once per snooze window, auto-hide after a few seconds
  useEffect(() => {
    const lastSeen = Number(localStorage.getItem(TEASER_SEEN_KEY) || 0);
    if (Date.now() - lastSeen < TEASER_SNOOZE_MS) return;
    const showTimer = setTimeout(() => setShowTeaser(true), 1200);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!showTeaser) return;
    const hideTimer = setTimeout(() => dismissTeaser(), 7000);
    return () => clearTimeout(hideTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTeaser]);

  // Every time messages change (including each streamed word), persist the
  // conversation and scroll to the newest message.
  useEffect(() => {
    saveHistory(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // full-screen on phones: stop the page behind from scrolling while the
  // panel is open, restore it when the panel closes.
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobile]);

  function dismissTeaser() {
    setShowTeaser(false);
    localStorage.setItem(TEASER_SEEN_KEY, String(Date.now())); // remember "seen now" -> 3-day snooze
  }

  function openPanel() {
    dismissTeaser();
    setIsOpen(true);
  }

  function clearHistory() {
    setMessages([]);
    sessionStorage.removeItem(HISTORY_KEY);
  }

  // Copy the assistant's answer to the clipboard; the icon flips to a
  // checkmark for a moment as confirmation.
  async function handleCopy(message, idx) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) - fail silently */
    }
  }

  // Share the answer via the phone's native share sheet when available;
  // otherwise download the whole conversation as a text file.
  async function handleShare(message) {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kyambogo Programme Assistant", text: message.text });
        return;
      }
    } catch {
      /* user cancelled or share failed - fall through to the download */
    }
    downloadConversation();
  }

  function downloadConversation() {
    const lines = messages.map((m) =>
      `${m.role === "user" ? "You" : "Assistant"}: ${m.text}`
    );
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kyambogo-assistant-chat.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Toggle the thumbs-up on one assistant answer. Like and dislike are
  // mutually exclusive — picking one clears the other. The new state is
  // also sent to the backend (attached to this answer's turn_id), so the
  // analysis tool can see which answers applicants rate well.
  function handleLike(idx) {
    const target = messages[idx];
    if (!target) return;
    const newLiked = !target.liked;
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, liked: newLiked, disliked: false } : m))
    );
    sendFeedback(target, newLiked ? "like" : null);
  }

  function handleDislike(idx) {
    const target = messages[idx];
    if (!target) return;
    const newDisliked = !target.disliked;
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, disliked: newDisliked, liked: false } : m))
    );
    sendFeedback(target, newDisliked ? "dislike" : null);
  }

  async function sendFeedback(message, feedback) {
    if (!message?.turn_id) return; // old history has no server turn to attach to
    try {
      await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn_id: message.turn_id, feedback, client_id: getClientId() }),
      });
    } catch {
      /* offline - the tap still shows locally, chat keeps working */
    }
  }

  /**
   * Sends one message and streams the reply in.
   *
   * Flow:
   *   1. Append the user's message, plus an EMPTY assistant placeholder
   *      (rendered as the three bouncing "typing" dots until text arrives).
   *   2. POST to the backend with stream: true.
   *   3. Read the response as a stream. The backend sends SSE frames:
   *         event: answer  data: {"delta":"a few characters"}
   *         event: answer  data: {"delta":"more characters"}   ...
   *         event: done    data: {"disclaimer":"..."}
   *      Every "answer" frame appends its delta to the placeholder's text,
   *      which is what produces the typewriter effect.
   *   4. On "done", stop and attach the disclaimer (if any).
   *
   * overrideText: lets the suggestion chips send a question directly,
   * without typing it into the input first.
   */
  const sendMessage = useCallback(
    async (overrideText) => {
      const question = (overrideText ?? input).trim();
      if (!question || sending) return; // ignore empty input and double-sends

      const userMsg = { role: "user", text: question, ts: Date.now() };
      const nextMessages = [...messages, userMsg];
      setMessages([
        ...nextMessages,
        { role: "assistant", text: "", streaming: true, ts: Date.now() },
      ]);
      setInput("");
      setSending(true);

      try {
        const res = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // only the last few turns are sent up - the server stays stateless
          body: JSON.stringify({
            question,
            history: nextMessages.slice(-widgetSettings.historyTurns).map((m) => ({ role: m.role, text: m.text })),
            programme_id: programmeId,
            client_id: getClientId(), // anonymous analytics id
            stream: true,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

        const reader = res.body.getReader(); // stream reader — lets us process chunks as they arrive
        const decoder = new TextDecoder(); // turns raw bytes into text
        let buffer = ""; // holds partial SSE frames that aren't complete yet
        let streamDone = false; // becomes true when the "done" event arrives

        // apply one parsed SSE frame to the message state
        const handleFrame = (frame) => {
          const lines = frame.split("\n");
          const eventName = lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
          const dataLine = lines
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          let payload;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            return; // unparseable frame — skip it
          }
          if (eventName === "answer") {
            const delta = payload.delta ?? "";
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
              }
              return prev;
            });
          } else if (eventName === "replace") {
            // the server cut the stream (guardrail tripped or every model
            // failed) and sends a safe fallback answer instead
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, text: payload.answer ?? "" }];
              }
              return prev;
            });
          } else if (eventName === "done") {
            streamDone = true;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    streaming: false,
                    disclaimer: payload.disclaimer || null,
                    turn_id: payload.turn_id ?? null, // lets 👍/👎 attach to this exact answer server-side
                  },
                ];
              }
              return prev;
            });
          }
        };

        // Read until the stream ends. SSE frames are separated by a blank
        // line ("\n\n"), and network chunks can cut frames in half, so we
        // buffer and only parse complete frames.
        while (!streamDone) {
          const { value, done: readerDone } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !readerDone });
          if (readerDone) break;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleFrame(frame);
          }
        }
        if (!streamDone && buffer.trim()) {
          handleFrame(buffer); // last frame may arrive without a trailing blank line
        }
      } catch {
        // network error / server down: replace the typing placeholder with
        // a friendly error bubble
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: ERROR_FALLBACK, error: true, streaming: false },
            ];
          }
          return [...prev, { role: "assistant", text: ERROR_FALLBACK, error: true, ts: Date.now() }];
        });
      } finally {
        // safety net: never leave the UI stuck on "typing"
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        setSending(false);
      }
    },
    [input, sending, messages, programmeId, widgetSettings.historyTurns]
  );

  // Desktop keeps the fixed 340x480 panel; mobile stretches it edge-to-edge.
  const panelStyle =
    isOpen && isMobile ? { ...styles.panel, ...styles.panelMobile } : styles.panel;

  return (
    <>
      <style>{cssKeyframes}</style>
      <div style={styles.root}>
        {/* ---- closed state: the floating bubble + teaser ---- */}
        {!isOpen && (
          <div style={styles.bubbleWrap}>
            {showTeaser && (
              <div style={styles.teaser} onClick={openPanel}>
                {teaserText}
                <button
                  aria-label="Dismiss"
                  style={styles.teaserClose}
                  onClick={(e) => {
                    e.stopPropagation(); // close the teaser without opening the panel
                    dismissTeaser();
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <button
              style={{ ...styles.bubble, background: widgetSettings.accent }}
              onClick={openPanel}
              aria-label="Open the programme assistant"
            >
              <ChatIcon />
            </button>
          </div>
        )}

        {/* ---- open state: the chat panel ---- */}
        {isOpen && (
          <div style={panelStyle} role="dialog" aria-label="Programme assistant">
            {/* header: university crest + greeting + close button.
                On mobile the panel is full-screen, so this close button sits
                at the top-right corner of the screen. */}
            <div style={styles.header}>
              <img
                src={widgetSettings.badge || crestUrl}
                alt="Kyambogo University"
                style={styles.headerLogo}
              />
              <div style={styles.headerText}>
                <div style={styles.headerTitle}>
                  {timeGreeting()}
                  {userName ? `, ${userName}` : ""}
                </div>
                <div style={styles.headerSubtitle}>{widgetSettings.botName}</div>
              </div>
              <button
                style={styles.closeBtn}
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                ×
              </button>
            </div>

            {/* messages area: auto-scrolls to the newest message */}
            <div style={styles.messages} ref={scrollRef}>
              {messages.length === 0 && (
                <div style={styles.emptyState}>
                  <div style={styles.emptyTitle}>{widgetSettings.greeting}</div>
                  <div style={styles.suggestions}>
                    {(widgetSettings.suggestions ?? SUGGESTIONS).map((s) => (
                      <button key={s} style={styles.chip} onClick={() => sendMessage(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={
                    m.role === "user"
                      ? styles.bubbleUser
                      : { ...styles.bubbleBot, ...(m.error ? styles.bubbleError : null) }
                  }
                >
                  {/* empty + still streaming = show the typing dots.
                      Assistant answers are rendered as markdown (so tables,
                      bold, lists and code look like ChatGPT's, not raw
                      pipes and asterisks); user messages stay plain text. */}
                  {m.role === "assistant" && m.text === "" && m.streaming ? (
                    <TypingDots />
                  ) : m.role === "assistant" ? (
                    <div className="pcs-md">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{ table: MarkdownTable }}
                      >
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.text
                  )}
                  {m.disclaimer && <div style={styles.disclaimer}>{m.disclaimer}</div>}
                  {/* action row: copy / share / like — only under finished
                      assistant answers, never while still streaming */}
                  {m.role === "assistant" && !m.streaming && !m.error && (
                    <div style={styles.msgActions}>
                      <button
                        style={styles.actionBtn}
                        onClick={() => handleCopy(m, i)}
                        aria-label="Copy answer"
                      >
                        {copiedIdx === i ? <CheckIcon /> : <CopyIcon />}
                      </button>
                      <button
                        style={styles.actionBtn}
                        onClick={() => handleShare(m)}
                        aria-label="Share or export answer"
                      >
                        <ShareIcon />
                      </button>
                      <button
                        style={m.disliked ? { ...styles.actionBtn, ...styles.actionBtnLiked } : styles.actionBtn}
                        onClick={() => handleDislike(i)}
                        aria-label="Dislike answer"
                      >
                        <ThumbsDownIcon filled={!!m.disliked} />
                      </button>
                      <button
                        style={m.liked ? { ...styles.actionBtn, ...styles.actionBtnLiked } : styles.actionBtn}
                        onClick={() => handleLike(i)}
                        aria-label="Like answer"
                      >
                        <ThumbsUpIcon filled={!!m.liked} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* composer: text input + send button, pinned to the bottom.
                On mobile it gets extra bottom padding so the phone's home
                bar doesn't cover it. */}
            <div style={isMobile ? { ...styles.inputRow, ...styles.inputRowMobile } : styles.inputRow}>
              <input
                style={styles.input}
                value={input}
                placeholder="Ask about any programme…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button
                style={{
                  ...styles.sendBtn,
                  opacity: sending || !input.trim() ? 0.4 : 1, // dimmed when there's nothing to send
                }}
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>

            {messages.length > 0 && (
              <button style={styles.clearBtn} onClick={clearHistory}>
                <u>Clear conversation</u>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Tables render inline in the chat, with an expand button (top-right).
// Tapping it pops the table out into a full-screen overlay where it can be
// scrolled vertically and horizontally - the Gemini way - instead of being
// cramped inside the chat bubble. The overlay gets a title (taken from the
// title line the AI writes above the table) and a Kyambogo crest badge.
function MarkdownTable(props) {
  const [expandedHtml, setExpandedHtml] = useState(null);
  const [expandedTitle, setExpandedTitle] = useState("Programme information");
  const tableRef = useRef(null);

  function openExpanded() {
    if (!tableRef.current) return;
    setExpandedHtml(tableRef.current.outerHTML); // capture the table as-is

    // Title: the AI writes a short title line directly above the table
    // (e.g. **Career Prospects**). Walk the rendered blocks above the
    // table and use the first short one as the overlay title.
    let el = tableRef.current.closest(".pcs-tablewrap")?.previousElementSibling;
    while (el) {
      const text = (el.textContent || "").trim();
      if (text && text.length < 60) break; // short block = title
      el = el.previousElementSibling;
    }
    setExpandedTitle(el ? (el.textContent || "").trim() : "Programme information");

    document.body.style.overflow = "hidden"; // lock the page behind the overlay
  }

  function closeExpanded() {
    setExpandedHtml(null);
    document.body.style.overflow = "";
  }

  return (
    <>
      <div className="pcs-tablewrap">
        <table {...props} ref={tableRef} />
        <button
          className="pcs-tableexpand"
          onClick={openExpanded}
          aria-label="Expand table"
        >
          <ExpandIcon />
        </button>
      </div>
      {expandedHtml && (
        <div className="pcs-tableoverlay" onClick={closeExpanded}>
          <div
            className="pcs-tableoverlay-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pcs-tableoverlay-head">
              <img
                src="/kyu-crest.png"
                alt="Kyambogo University"
                className="pcs-tableoverlay-crest"
              />
              <div className="pcs-tableoverlay-title">{expandedTitle}</div>
              <button
                className="pcs-tableoverlay-close"
                onClick={closeExpanded}
                aria-label="Close table view"
              >
                ×
              </button>
            </div>
            {/* the captured table markup is our own react-markdown output,
                so re-rendering it verbatim is safe */}
            <div className="pcs-md" dangerouslySetInnerHTML={{ __html: expandedHtml }} />
          </div>
        </div>
      )}
    </>
  );
}

// Three bouncing dots shown while the assistant is "typing".
function TypingDots() {
  return (
    <span style={styles.typing}>
      <span style={styles.typingDot} />
      <span style={{ ...styles.typingDot, animationDelay: "0.15s" }} />
      <span style={{ ...styles.typingDot, animationDelay: "0.3s" }} />
    </span>
  );
}

function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 4h16v12H8l-4 4V4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 19V5m-6 6 6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// two overlapping squares — the "copy" icon
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

// share-nodes symbol — three circles connected in a Y, the classic share icon
function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

// thumbs-down; filled solid when the answer is disliked
function ThumbsDownIcon({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

// thumbs-up; filled solid when the answer is liked
function ThumbsUpIcon({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

// four outward-pointing corners — the "expand to full screen" icon
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// checkmark shown briefly after copying
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Keyframes and the markdown styles can't be written inline, so the
// component injects them once into the page. The .pcs-* rules style the
// AI's rendered markdown - tables especially, ChatGPT-style.
const cssKeyframes = `
@keyframes pcsTypingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}

/* ---- markdown rendering (ChatGPT-style) ---- */
.pcs-md { word-break: break-word; }
.pcs-md p { margin: 0 0 8px; }
.pcs-md p:last-child { margin-bottom: 0; }
.pcs-md strong { font-weight: 600; }
.pcs-md ul, .pcs-md ol { margin: 0 0 8px; padding-left: 20px; }
.pcs-md li { margin-bottom: 2px; }
.pcs-md h3, .pcs-md h4 { margin: 10px 0 4px; font-size: 14px; font-weight: 600; }
.pcs-md code {
  background: #f7f7f8; border-radius: 4px; padding: 1px 4px;
  font-size: 12.5px; font-family: ui-monospace, Consolas, monospace;
}
.pcs-md pre {
  background: #f7f7f8; border-radius: 8px; padding: 10px 12px;
  overflow-x: auto; margin: 0 0 8px;
}
.pcs-md pre code { background: transparent; padding: 0; }

/* tables: rounded frame, gray header row, thin row separators */
.pcs-tablewrap {
  position: relative;
  overflow-x: auto; margin: 4px 0 8px;
  border: 1px solid #e5e5e5; border-radius: 8px;
}
.pcs-md table {
  border-collapse: collapse; width: 100%;
  font-size: 12.5px; min-width: 280px;
}
.pcs-md th {
  background: #f7f7f8; text-align: left; padding: 8px 10px;
  border-bottom: 1px solid #e5e5e5; font-weight: 600;
}
.pcs-md td {
  padding: 8px 10px; border-bottom: 1px solid #ececec; vertical-align: top;
}
.pcs-md tr:last-child td { border-bottom: none; }

/* expand button floating on the table's top-right corner */
.pcs-tableexpand {
  position: absolute; top: 6px; right: 6px;
  background: rgba(255, 255, 255, 0.9); border: 1px solid #e5e5e5;
  border-radius: 6px; width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #666; padding: 0;
}

/* the Gemini-style pop-out: dimmed backdrop + scrollable white card */
.pcs-tableoverlay {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.pcs-tableoverlay-card {
  position: relative; background: #fff; border-radius: 12px;
  padding: 14px 16px; max-width: min(92vw, 900px); max-height: 84vh;
  overflow: auto;
}
/* sticky title bar: crest badge + title + close button */
.pcs-tableoverlay-head {
  position: sticky; top: 0; z-index: 2; background: #fff;
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 10px; margin-bottom: 8px;
  border-bottom: 1px solid #ececec;
}
.pcs-tableoverlay-crest {
  height: 30px; background: #fff; border: 1px solid #e8e8e8;
  border-radius: 8px; padding: 3px 4px; object-fit: contain;
  flex-shrink: 0;
}
.pcs-tableoverlay-title {
  flex: 1; min-width: 0; font-size: 15px; font-weight: 600;
  color: #0d0d0d;
}
.pcs-tableoverlay-close {
  background: #f0f0f0; border: none; border-radius: 50%;
  width: 32px; height: 32px; font-size: 18px; cursor: pointer; color: #333;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
`;

// Kyambogo brand palette: blue #1B5EA9 (primary) + gold #F8B13A (accent),
// on a ChatGPT-style light conversation area.
// All visual tweaks (colors, sizes, spacing, fonts) happen here.
const styles = {
  // ---- the whole widget: fixed to the bottom-right corner of the page ----
  root: { position: "fixed", right: 20, bottom: 20, zIndex: 1000, fontFamily: "system-ui, sans-serif" },

  // ---- closed state: teaser + blue bubble ----
  bubbleWrap: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  bubble: {
    width: 56, height: 56, borderRadius: "50%", border: "none",
    background: "#1B5EA9", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
  },
  teaser: {
    background: "#F8B13A", color: "#0d0d0d", padding: "10px 14px",
    borderRadius: 12, fontSize: 13, maxWidth: 220, cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.2)", position: "relative",
  },
  teaserClose: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20,
    borderRadius: "50%", border: "none", background: "#1B5EA9", color: "#fff",
    cursor: "pointer", fontSize: 12, lineHeight: "20px",
  },

  // ---- the chat panel (desktop size; 576 -10% -> 518) ----
  // maxWidth/maxHeight keep the panel inside the screen even on short or
  // landscape desktop windows, instead of overflowing off the bottom
  panel: {
    width: 340, height: 518, background: "#fff", borderRadius: 16,
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)", display: "flex",
    flexDirection: "column", overflow: "hidden",
    maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 100px)",
  },
  // phones: the panel takes over the whole screen, close button (header)
  // ends up at the top-right corner of the viewport.
  // position:fixed is what actually pins it edge-to-edge - without it the
  // inset values are ignored and the panel hugs the bubble instead.
  panelMobile: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    width: "auto", height: "auto", borderRadius: 0, boxShadow: "none",
  },

  // ---- header: crest, greeting, close button ----
  header: {
    background: "#1B5EA9", color: "#fff", padding: "12px 14px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: 10,
  },
  // white chip behind the crest so the blue/gold reads on the blue header
  headerLogo: {
    height: 30, background: "#fff", borderRadius: 8,
    padding: 4, objectFit: "contain", flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 15, fontWeight: 600 },
  headerSubtitle: { fontSize: 11, opacity: 0.8, marginTop: 2 },
  closeBtn: {
    background: "transparent", border: "none", color: "#fff",
    width: 34, height: 34, fontSize: 22, cursor: "pointer", lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // ---- the conversation area ----
  // minHeight: 0 is required for iOS Safari - without it a flex child with
  // overflow refuses to shrink and the conversation becomes unscrollable
  messages: {
    flex: 1, overflowY: "auto", padding: 16, background: "#fff",
    display: "flex", flexDirection: "column", gap: 12, minHeight: 0,
  },
  emptyState: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 14,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: "#0d0d0d" },
  suggestions: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  chip: {
    border: "1px solid #e0e0e0", background: "#fff", color: "#0d0d0d",
    borderRadius: 16, padding: "8px 14px", fontSize: 12.5, cursor: "pointer",
    textAlign: "left", lineHeight: 1.4,
  },

  // ---- message bubbles ----
  bubbleUser: {
    alignSelf: "flex-end", background: "#f4f4f4", color: "#0d0d0d",
    padding: "10px 14px", borderRadius: "18px 18px 4px 18px",
    maxWidth: "80%", fontSize: 14, lineHeight: 1.5,
  },
  bubbleBot: {
    alignSelf: "flex-start", background: "transparent", color: "#0d0d0d",
    padding: "8px 2px", maxWidth: "85%", fontSize: 14, lineHeight: 1.55,
    // note: line breaks in AI answers are now handled by the markdown
    // renderer (remark-breaks), not by whiteSpace here
  },
  bubbleError: { color: "#b00020" },
  disclaimer: { marginTop: 6, fontSize: 11, color: "#9e9e9e" },

  // ---- action row under each assistant answer (copy / share / like) ----
  msgActions: { display: "flex", gap: 2, marginTop: 2 },
  actionBtn: {
    background: "transparent", border: "none", color: "#9e9e9e",
    width: 28, height: 28, borderRadius: 6, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
  },
  actionBtnLiked: { color: "#F8B13A" }, // gold thumbs-up when liked

  // ---- typing indicator (the three bouncing dots) ----
  typing: { display: "inline-flex", gap: 4, padding: "6px 2px" },
  typingDot: {
    width: 6, height: 6, borderRadius: "50%", background: "#F8B13A",
    animation: "pcsTypingBounce 1.2s infinite ease-in-out",
  },

  // ---- composer: input + send button ----
  inputRow: {
    display: "flex", gap: 8, padding: "10px 12px 12px",
    borderTop: "1px solid #ececec", alignItems: "center",
  },
  // extra bottom padding on phones so the composer clears the home bar
  inputRowMobile: { paddingBottom: "calc(12px + env(safe-area-inset-bottom))" },
  input: {
    flex: 1, border: "1px solid #d0d0d0", borderRadius: 24, padding: "10px 16px",
    fontSize: 14, outline: "none", background: "#fff", color: "#0d0d0d",
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: "50%", border: "none",
    background: "#1B5EA9", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  // ---- "Clear conversation" link under the composer ----
  clearBtn: {
    border: "none", background: "transparent", color: "#9e9e9e",
    fontSize: 11, padding: "2px 12px 10px", cursor: "pointer", textAlign: "right",
  },
};
