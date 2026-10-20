// Settings — console configuration and serious operations, in the spirit of
// Chatbase's console: AI control (force stop / maintenance), chat interface
// (branding), API & models (key + model chain + spares), rate limiting,
// canned fallback messages, console activity, and a danger zone.
// Each tile has an explicit Update button that stays dull until the user
// actually changes something, then saves through settings_api.php.

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  Power,
  Palette,
  Gauge,
  TriangleAlert,
  CircleCheck,
  CircleX,
  Download,
  MessageSquareWarning,
  BrainCircuit,
} from "lucide-react";
import {
  fetchSettings,
  saveSetting,
  fetchConsoleActivity,
  clearChatEvents,
  type ConsoleSettings,
  type ConsoleActivityItem,
} from "../services/monitoringService";
import { fmtAgo, fmtDateTime, fmtInt } from "../components/charts/format";
import { useBackgroundRefresh } from "../../../src/hooks/useBackgroundRefresh";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

const ACTION_BADGE: Record<string, string> = {
  "settings.update": "info",
  "danger.clear_events": "critical",
};

// api_key_set is a server-provided flag, never a form field
type SettingKey = Exclude<keyof ConsoleSettings, "api_key_set">;
type Draft = Partial<Record<SettingKey, string>>;

/** One tile = a set of keys with local drafts; Update saves only what changed. */
function useTileDraft(settings: ConsoleSettings | null) {
  const [draft, setDraft] = useState<Draft>({});

  // seed the draft once settings arrive
  useEffect(() => {
    if (settings) setDraft({});
  }, [settings]);

  const set = (key: SettingKey, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirtyKeys = settings
    ? (Object.keys(draft) as SettingKey[]).filter((k) => draft[k] !== settings[k])
    : [];

  return { draft, set, dirtyKeys, setDraft };
}

function exportActivityCsv(activity: ConsoleActivityItem[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["time", "actor", "action", "detail"];
  const rows = activity.map((a) =>
    [new Date(a.ts).toISOString(), a.actor, a.action, a.detail].map(esc).join(","),
  );
  const blob = new Blob([[head.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kyu-console-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

interface SettingsPageProps {
  actorName?: string;
}

export function SettingsPage({ actorName = "System Administrator" }: SettingsPageProps) {
  const [settings, setSettings] = useState<ConsoleSettings | null>(null);
  const [activity, setActivity] = useState<ConsoleActivityItem[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [settingsPassword, setSettingsPassword] = useState("");
  const [clearDays, setClearDays] = useState<30 | 90 | 0>(30);
  const [dangerPassword, setDangerPassword] = useState("");
  const [clearing, setClearing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; kind: "ok" | "err"; text: string }[]>([]);
  const toastId = useRef(0);
  const avatarInput = useRef<HTMLInputElement>(null);

  const ai = useTileDraft(settings);
  const instructions = useTileDraft(settings);
  const ui = useTileDraft(settings);
  const rate = useTileDraft(settings);
  const models = useTileDraft(settings);
  const messages = useTileDraft(settings);

  const toast = useCallback((kind: "ok" | "err", text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextSettings, nextActivity] = await Promise.all([
        fetchSettings(),
        fetchConsoleActivity(),
      ]);
      setSettings(nextSettings);
      setActivity(nextActivity);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "AI settings are unavailable.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useBackgroundRefresh(async () => {
    const hasDraft = [ai, instructions, ui, rate, models, messages].some((tile) => tile.dirtyKeys.length > 0);
    if (!saving && !hasDraft) await refresh();
  }, "standard");

  const actor = actorName;

  const saveTile = async (tile: ReturnType<typeof useTileDraft>, label: string) => {
    if (!settings) return;
    const keys = tile.dirtyKeys.filter((k) => k !== "api_key");
    if (keys.length === 0) return;
    if (!settingsPassword) return toast("err", "Enter your current password before saving.");
    setSaving(label);
    try {
      for (const key of keys) {
        await saveSetting(key, tile.draft[key] ?? "", actor, settingsPassword);
      }
      setSettings((s) => (s ? ({ ...s, ...tile.draft } as ConsoleSettings) : s));
      tile.setDraft({});
      setSettingsPassword("");
      await refresh();
      toast("ok", label);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const onToggleAi = () => {
    if (!settings) return;
    if (!settingsPassword) return toast("err", "Enter your current password before changing the assistant status.");
    const next = settings.ai_status === "online" ? "stopped" : "online";
    if (next === "stopped" && !window.confirm("Force-stop the assistant? Visitors will get the maintenance message until you bring it back online.")) {
      return;
    }
    setSaving("ai_status");
    saveSetting("ai_status", next, actor, settingsPassword)
      .then(() => {
        setSettings((s) => (s ? { ...s, ai_status: next } : s));
        setSettingsPassword("");
        refresh();
        toast("ok", next === "stopped" ? "Assistant force-stopped" : "Assistant back online");
      })
      .catch((err) => toast("err", err instanceof Error ? err.message : "Could not save"))
      .finally(() => setSaving(null));
  };

  const onClear = async () => {
    if (!dangerPassword) return toast("err", "Enter your current password before clearing telemetry.");
    if (!window.confirm(
      clearDays === 0
        ? "Delete ALL chat events? This cannot be undone."
        : `Delete chat events older than ${clearDays} days? This cannot be undone.`,
    )) return;
    setClearing(true);
    try {
      const deleted = await clearChatEvents(clearDays, actor, dangerPassword);
      setDangerPassword("");
      await refresh();
      toast("ok", `${fmtInt(deleted)} event${deleted === 1 ? "" : "s"} deleted`);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Could not clear events");
    } finally {
      setClearing(false);
    }
  };

  const stopped = settings?.ai_status === "stopped";
  const val = (tile: ReturnType<typeof useTileDraft>, key: SettingKey) =>
    tile.draft[key] !== undefined ? tile.draft[key] : (settings?.[key] ?? "");

  const inputProps = (
    tile: ReturnType<typeof useTileDraft>,
    key: SettingKey,
  ) => ({
    value: val(tile, key),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      tile.set(key, e.target.value),
  });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div className="sub">Assistant behaviour, console operations and admin activity</div>
        </div>
        {settings && (
          <span className={`status-pill ${stopped ? "critical" : "good"}`}>
            <span className="dot" />
            {stopped ? "Assistant stopped" : "Assistant online"}
          </span>
        )}
      </div>

      {loadError && (
        <div className="card" role="alert" style={{ marginBottom: 16, borderColor: "rgba(208, 59, 59, 0.35)", color: "var(--status-critical)" }}>
          {loadError} No substitute data has been displayed. Please try again.
          <button className="btn sm" style={{ marginLeft: 12 }} onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="form-field" style={{ maxWidth: 440 }}>
          <span className="ff-label">Confirm current password to save AI settings</span>
          <input
            type="password"
            autoComplete="current-password"
            value={settingsPassword}
            onChange={(event) => setSettingsPassword(event.target.value)}
            placeholder="Current account password"
          />
          <span className="small muted">Used only for the next settings update and cleared after a successful save.</span>
        </label>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        {/* AI control */}
        <div className="card">
          <div className="card-head">
            <h3>AI control</h3>
            <Power size={15} style={{ color: stopped ? "var(--status-critical)" : "var(--status-good)" }} />
          </div>
          <div className="ai-row">
            <div>
              <div className="cell-main">Force stop the assistant</div>
              <div className="small muted">
                {stopped
                  ? "Visitors get the maintenance / 404 message. No AI calls, no cost."
                  : "Toggles the kill-switch the widget checks on every message."}
              </div>
            </div>
            <button className={`btn ${stopped ? "primary" : "danger"}`} onClick={onToggleAi} disabled={!settings}>
              {saving === "ai_status" ? "Saving…" : stopped ? "Bring back online" : "Force stop"}
            </button>
          </div>

          <div className="form-stack" style={{ marginTop: 14 }}>
            <label className="form-field">
              <span className="ff-label">Maintenance message</span>
              <textarea rows={2} {...inputProps(ai, "maintenance_message")} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className={`btn primary ${ai.dirtyKeys.length === 0 ? "dull" : ""}`}
                disabled={ai.dirtyKeys.length === 0 || saving !== null}
                onClick={() => void saveTile(ai, "AI control saved")}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* AI instructions */}
        <div className="card">
          <div className="card-head">
            <h3>AI instructions</h3>
            <BrainCircuit size={15} style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="form-stack">
            <label className="form-field">
              <span className="ff-label">System prompt — personality &amp; rules</span>
              <textarea
                rows={12}
                {...inputProps(instructions, "system_prompt")}
                style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.74rem", lineHeight: 1.5 }}
              />
              <span className="small muted">
                <code className="mono">{"{{context}}"}</code> is replaced per request with the retrieved chunks and live catalogue stats.
              </span>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className="form-field" style={{ flex: "1 1 130px" }}>
                <span className="ff-label">Context chunks (top-k)</span>
                <input type="number" min={1} max={12} {...inputProps(instructions, "context_chunks")} />
              </label>
              <label className="form-field" style={{ flex: "1 1 130px" }}>
                <span className="ff-label">History turns</span>
                <input type="number" min={1} max={20} {...inputProps(instructions, "history_turns")} />
              </label>
              <label className="form-field" style={{ flex: "1 1 130px" }}>
                <span className="ff-label">Typing speed (ms)</span>
                <input type="number" min={0} max={200} {...inputProps(instructions, "stream_speed_ms")} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className={`btn primary ${instructions.dirtyKeys.length === 0 ? "dull" : ""}`}
                disabled={instructions.dirtyKeys.length === 0 || saving !== null}
                onClick={() => void saveTile(instructions, "AI instructions saved")}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* Chat interface */}
        <div className="card">
          <div className="card-head">
            <h3>Chat interface</h3>
            <Palette size={15} style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="form-stack">
            <label className="form-field">
              <span className="ff-label">Assistant name</span>
              <input {...inputProps(ui, "bot_name")} placeholder="Programme assistant" />
            </label>
            <label className="form-field">
              <span className="ff-label">Accent colour</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={val(ui, "accent_color") || "#1B5EA9"}
                  onChange={(e) => ui.set("accent_color", e.target.value)}
                  style={{ width: 44, height: 36, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "none", cursor: "pointer" }}
                  title="Accent colour"
                />
                <input {...inputProps(ui, "accent_color")} placeholder="#1B5EA9" />
              </div>
              <span className="small muted">Colours the chat bubble in the widget</span>
            </label>
            <label className="form-field">
              <span className="ff-label">Greeting</span>
              <input {...inputProps(ui, "greeting")} placeholder="What can I help with?" />
            </label>
            <div className="ai-row" style={{ marginTop: 2 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  className="avatar lg profile-avatar"
                  onClick={() => avatarInput.current?.click()}
                  title="Widget badge — the picture shown in the chat header. Saved securely with Update."
                  style={
                    (val(ui, "profile_avatar") || settings?.profile_avatar)
                      ? { backgroundImage: `url(${val(ui, "profile_avatar") || settings?.profile_avatar})` }
                      : undefined
                  }
                >
                  {!(val(ui, "profile_avatar") || settings?.profile_avatar) && initials(val(ui, "bot_name") || "AI")}
                  <span className="avatar-cam">
                    <Camera size={12} />
                  </span>
                </button>
                <span className="small muted">Widget badge</span>
              </div>
              <span className="small muted" style={{ flex: 1 }}>
                This picture replaces the Kyambogo crest in the chat header for visitors. Falls back to the crest when empty.
              </span>
            </div>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) return toast("err", "Please choose an image file");
                if (file.size > 512 * 1024) return toast("err", "Badge image must be under 512 KB");
                const reader = new FileReader();
                reader.onload = () => ui.set("profile_avatar", String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
            <label className="form-field">
              <span className="ff-label">Suggested messages — one per line</span>
              <textarea
                rows={3}
                {...inputProps(ui, "suggestions")}
                placeholder={"What are the entry requirements for BSc Computer Science?\nCompare BSc IT and BSc Software Engineering"}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className={`btn primary ${ui.dirtyKeys.length === 0 ? "dull" : ""}`}
                disabled={ui.dirtyKeys.length === 0 || saving !== null}
                onClick={() => void saveTile(ui, "Chat interface saved")}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* API & models */}
        <div className="card">
          <div className="card-head">
            <h3>API &amp; models</h3>
            <BrainCircuit size={15} style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="form-stack">
            <label className="form-field">
              <span className="ff-label">API key</span>
              <div className={`status-pill ${settings?.api_key_set ? "good" : "warning"}`} style={{ alignSelf: "flex-start" }}>
                <span className="dot" />
                {settings?.api_key_set ? "Configured on the server" : "Not configured"}
              </div>
              <span className="small muted">
                {settings?.api_key_set
                  ? "The value never leaves the secure store. Rotate it from the portal's System Settings credential controls."
                  : "Configure the NVIDIA credential from System Settings. Secret values are write-only and are never returned to this monitor."}
              </span>
            </label>
            <label className="form-field">
              <span className="ff-label">Embedding model</span>
              <input value={settings?.embed_model || "Managed by deployment configuration"} readOnly disabled />
              <span className="small muted">
                Locked here because changing it requires a controlled schema migration and complete re-index.
              </span>
            </label>
            <label className="form-field">
              <span className="ff-label">Chat model chain — primary first, spares below</span>
              <textarea
                rows={4}
                {...inputProps(models, "chat_models")}
                placeholder={"openai/gpt-oss-20b\nminimaxai/minimax-m3\nmoonshotai/kimi-k3"}
                style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.8rem" }}
              />
              <span className="small muted">Up to three models are tried in order within one bounded request window.</span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className={`btn primary ${models.dirtyKeys.length === 0 ? "dull" : ""}`}
                disabled={models.dirtyKeys.length === 0 || saving !== null}
                onClick={() => void saveTile(models, "API & models saved")}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* Rate limiting */}
        <div className="card">
          <div className="card-head">
            <h3>Rate limiting</h3>
            <Gauge size={15} style={{ color: "var(--ink-3)" }} />
          </div>
          <label className="form-field" style={{ maxWidth: 260 }}>
            <span className="ff-label">Messages per hour per visitor</span>
            <input
              type="number"
              min={1}
              max={200}
              {...inputProps(rate, "rate_limit_per_hour")}
            />
          </label>
          <div className="small muted" style={{ marginTop: 8 }}>
            The widget refuses messages past the limit with a "slow down" reply — recorded in the audit log as a rate_limit warning.
          </div>
          <label className="form-field" style={{ maxWidth: 340, marginTop: 14 }}>
            <span className="ff-label">
              AI temperature — <span className="muted">{val(rate, "temperature")}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              {...inputProps(rate, "temperature")}
              style={{ accentColor: "var(--brand-blue)", width: "100%" }}
            />
            <span className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>0 — strict, only the catalogue</span>
              <span>1 — more creative</span>
            </span>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              className={`btn primary ${rate.dirtyKeys.length === 0 ? "dull" : ""}`}
              disabled={rate.dirtyKeys.length === 0 || saving !== null}
              onClick={() => void saveTile(rate, "Rate limit updated")}
            >
              Update
            </button>
          </div>
        </div>

        {/* Canned fallback messages */}
        <div className="card">
          <div className="card-head">
            <h3>Fallback messages</h3>
            <MessageSquareWarning size={15} style={{ color: "var(--ink-3)" }} />
          </div>
          <div className="form-stack">
            <label className="form-field">
              <span className="ff-label">Refused question (precheck)</span>
              <textarea rows={2} {...inputProps(messages, "msg_precheck")} />
            </label>
            <label className="form-field">
              <span className="ff-label">Nothing found in the catalogue</span>
              <textarea rows={2} {...inputProps(messages, "msg_nochunks")} />
            </label>
            <label className="form-field">
              <span className="ff-label">Blocked answer (postcheck scrub)</span>
              <textarea rows={2} {...inputProps(messages, "msg_blocked")} />
            </label>
            <label className="form-field">
              <span className="ff-label">Model failure</span>
              <textarea rows={2} {...inputProps(messages, "msg_error")} />
            </label>
            <label className="form-field">
              <span className="ff-label">Rate limit reply</span>
              <textarea rows={2} {...inputProps(messages, "msg_ratelimit")} />
            </label>
            <label className="form-field">
              <span className="ff-label">Eligibility disclaimer</span>
              <textarea rows={2} {...inputProps(messages, "msg_disclaimer")} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className={`btn primary ${messages.dirtyKeys.length === 0 ? "dull" : ""}`}
                disabled={messages.dirtyKeys.length === 0 || saving !== null}
                onClick={() => void saveTile(messages, "Fallback messages saved")}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        {/* Console activity */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Console activity</h3>
              <div className="hint">Settings changes and danger-zone operations, with the actor</div>
            </div>
            <button
              className="btn sm"
              onClick={() => activity && exportActivityCsv(activity)}
              disabled={!activity || activity.length === 0}
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
          {activity === null ? (
            <div className="empty-state">
              <div className="e-title">Loading activity…</div>
            </div>
          ) : activity.length === 0 ? (
            <div className="empty-state" style={{ padding: "26px 12px" }}>
              <div className="e-title">No console activity yet</div>
              <div className="small">Settings changes and danger-zone operations appear here</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id} className="row-hover">
                      <td className="small nowrap" title={fmtDateTime(a.ts)}>{fmtAgo(a.ts)}</td>
                      <td className="mono small">{a.actor}</td>
                      <td>
                        <span className={`badge ${ACTION_BADGE[a.action] ?? "neutral"}`} style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.68rem" }}>
                          {a.action}
                        </span>
                      </td>
                      <td className="small">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ borderColor: "rgba(208, 59, 59, 0.35)" }}>
        <div className="card-head">
          <h3 style={{ color: "var(--status-critical)" }}>Danger zone</h3>
          <TriangleAlert size={15} style={{ color: "var(--status-critical)" }} />
        </div>
        <div className="ai-row">
          <div>
            <div className="cell-main">Clear chat history</div>
            <div className="small muted">
              Permanently removes the selected assistant event history. Programme information is never changed.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="password"
              autoComplete="current-password"
              value={dangerPassword}
              onChange={(event) => setDangerPassword(event.target.value)}
              placeholder="Current password"
              aria-label="Current password for clearing events"
              style={{ minWidth: 190 }}
            />
            <select
              className="danger-select"
              value={clearDays}
              onChange={(e) => setClearDays(Number(e.target.value) as 30 | 90 | 0)}
              aria-label="Clear events older than"
            >
              <option value={30}>Older than 30 days</option>
              <option value={90}>Older than 90 days</option>
              <option value={0}>Everything</option>
            </select>
            <button className="btn" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }} onClick={onClear} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear events"}
            </button>
          </div>
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
