import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, FileCheck2, FileText, Loader2, LockKeyhole, RefreshCw, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import {
  fetchKnowledgeContent, fetchKnowledgeSource, fetchKnowledgeSources, releaseKnowledgeVersion, removeKnowledgeSource,
  resolveKnowledgeFinding, uploadKnowledgeSource, type KnowledgeChunk, type KnowledgeFinding,
  type KnowledgeSource, type KnowledgeSourceStatus, type KnowledgeSourceType, type KnowledgeVersion,
} from "../services/monitoringService";
import { fmtBytes, fmtDateTime, fmtInt } from "../components/charts/format";
import { StatTile } from "../components/charts/StatTile";
import { useBackgroundRefresh } from "../../../src/hooks/useBackgroundRefresh";

const ACCEPT = ".pdf,.xlsx,.csv,.docx,.md";
const TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  "general-guidance": "General guidance", "admissions-policy": "Admissions policy",
  "cutoff-points": "Cut-off points", "calculation-rules": "Calculation rules",
};
const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  quarantined: "Quarantined", processing: "Processing", "review-required": "Review required",
  "release-pending": "Indexing", released: "Released", failed: "Failed", superseded: "Superseded",
  "removal-pending": "Withdrawing from AI",
};
const NON_OVERRIDABLE = new Set(["antivirus_unavailable", "antivirus_failed", "malware_detected", "extraction_failed"]);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
function badgeClass(status: KnowledgeSourceStatus): string {
  if (status === "released") return "good";
  if (status === "failed") return "critical";
  if (status === "processing" || status === "release-pending" || status === "removal-pending") return "info";
  return "warning";
}
function currentVersion(source: KnowledgeSource | null): KnowledgeVersion | null {
  return source?.versions?.[0] ?? source?.latest_version ?? null;
}

export function DocumentsPage() {
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeSource | null>(null);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [previewExtension, setPreviewExtension] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("general-guidance");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [reviewPassword, setReviewPassword] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [releasePassword, setReleasePassword] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const [removalPassword, setRemovalPassword] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async (skipExpanded = false) => {
    try {
      const next = await fetchKnowledgeSources();
      setSources(next);
      const selectedStillExists = expandedId !== null && next.some((source) => source.id === expandedId);
      if (selectedStillExists && !skipExpanded) {
        setDetail(await fetchKnowledgeSource(expandedId));
      } else if (expandedId && !selectedStillExists) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (error) {
      setMessage({ kind: "err", text: errorText(error) });
      setSources((previous) => previous ?? []);
    }
  }, [expandedId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!previewOpen) return;
    const dialog = previewDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (dialog?.open) dialog.close();
    };
  }, [previewOpen]);
  const processing = sources?.some((source) => ["quarantined", "processing", "release-pending", "removal-pending"].includes(source.status)) ?? false;
  useBackgroundRefresh(() => refresh(), { seconds: processing ? 5 : 15 });

  const stats = useMemo(() => ({
    total: sources?.length ?? 0,
    released: sources?.filter((source) => source.status === "released").length ?? 0,
    review: sources?.filter((source) => source.status === "review-required").length ?? 0,
    blocked: sources?.filter((source) => (source.latest_version?.validation_summary?.blocking ?? 0) > 0).length ?? 0,
  }), [sources]);

  const selectFile = (next: File | null) => {
    setFile(next);
    if (next && title.trim() === "") setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const submitUpload = async () => {
    if (!file || title.trim() === "") return setMessage({ kind: "err", text: "Choose a document and provide a clear source title." });
    setBusy(true); setUploading(true); setMessage(null);
    try {
      const source = await uploadKnowledgeSource({ title: title.trim(), sourceType, description: description.trim(), file });
      setMessage({ kind: "ok", text: "Stored in private quarantine. Security scanning and extraction are now pending." });
      setTitle(""); setDescription(""); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setExpandedId(source.id); setDetail(source);
      await refresh(true);
    } catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
    finally { setBusy(false); setUploading(false); }
  };

  const toggleDetail = async (source: KnowledgeSource) => {
    if (expandedId === source.id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(source.id); setDetail(null);
    try { setDetail(await fetchKnowledgeSource(source.id)); }
    catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
  };

  const openPreview = async (source: KnowledgeSource, version: KnowledgeVersion) => {
    setBusy(true);
    try { setChunks(await fetchKnowledgeContent(source.id, version.id)); setPreviewExtension(version.extension); setPreviewOpen(true); }
    catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const resolveFinding = async (source: KnowledgeSource, version: KnowledgeVersion) => {
    if (!findingId || resolutionNote.trim().length < 10 || reviewPassword === "") return setMessage({ kind: "err", text: "Enter a review note of at least 10 characters and confirm your current password." });
    setBusy(true);
    try {
      const updated = await resolveKnowledgeFinding({ sourceId: source.id, versionId: version.id, findingId, resolutionNote, currentPassword: reviewPassword });
      setDetail(updated); setFindingId(null); setResolutionNote(""); setReviewPassword("");
      setMessage({ kind: "ok", text: "Finding resolved with an auditable review note." }); await refresh();
    } catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const release = async (source: KnowledgeSource, version: KnowledgeVersion) => {
    if (releaseReason.trim().length < 10 || releasePassword === "") return setMessage({ kind: "err", text: "Provide a release reason and confirm your current password." });
    setBusy(true);
    try {
      const updated = await releaseKnowledgeVersion({ sourceId: source.id, versionId: version.id, releaseReason, currentPassword: releasePassword });
      setDetail(updated); setReleaseReason(""); setReleasePassword("");
      setMessage({ kind: "ok", text: "Release accepted. It becomes AI-visible only after indexing succeeds." }); await refresh();
    } catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  const removeSource = async (source: KnowledgeSource) => {
    if (removalReason.trim().length < 10 || removalPassword === "") return setMessage({ kind: "err", text: "Provide a removal reason of at least 10 characters and confirm your current password." });
    setBusy(true); setMessage(null);
    try {
      const result = await removeKnowledgeSource({ sourceId: source.id, removalReason: removalReason.trim(), currentPassword: removalPassword });
      setRemovalReason(""); setRemovalPassword(""); setExpandedId(null); setDetail(null);
      setMessage({ kind: "ok", text: result.pending ? "Withdrawal queued. The record and private file will be removed after the AI index is cleared." : "The unreleased source and its private file were permanently removed." });
      setSources((previous) => previous?.filter((item) => item.id !== source.id) ?? previous);
      await refresh(true);
    } catch (error) { setMessage({ kind: "err", text: errorText(error) }); }
    finally { setBusy(false); }
  };

  return <main className="page">
    <div className="page-header"><div><h1>Governed Knowledge Sources</h1><div className="sub">Securely quarantine, inspect, review and release approved guidance for the programme assistant.</div></div><button className="btn" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} /> Refresh</button></div>
    {message && <div className={`card ${message.kind === "err" ? "danger-callout" : "success-callout"}`} style={{ padding: 12, marginBottom: 14 }}>{message.text}</div>}
    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <StatTile label="Sources" value={sources ? fmtInt(stats.total) : "…"} icon={<FileText size={15} />} />
      <StatTile label="Released" value={sources ? fmtInt(stats.released) : "…"} icon={<FileCheck2 size={15} />} />
      <StatTile label="Awaiting review" value={sources ? fmtInt(stats.review) : "…"} icon={<Eye size={15} />} />
      <StatTile label="Blocked" value={sources ? fmtInt(stats.blocked) : "…"} icon={<ShieldCheck size={15} />} />
    </div>
    <div className="grid cols-3 knowledge-layout" style={{ alignItems: "start" }}>
      <section className="card">
        <div className="card-head"><h3>Add a source</h3><span className="badge warning"><LockKeyhole size={11} /> Private quarantine</span></div>
        <p className="small muted">No upload becomes visible to the AI automatically. Legacy .xls/.doc files and executable content are rejected.</p>
        <label className="small" style={{ fontWeight: 700 }}>Source title</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. 2026/2027 cut-off points" />
        <label className="small" style={{ fontWeight: 700, marginTop: 10 }}>Information type</label><select className="input" value={sourceType} onChange={(event) => setSourceType(event.target.value as KnowledgeSourceType)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="small" style={{ fontWeight: 700, marginTop: 10 }}>Review context <span className="muted">(optional)</span></label><textarea className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="What this source covers and who approved it" />
        <button type="button" className="upload-zone" onClick={() => fileInput.current?.click()} style={{ width: "100%", marginTop: 12 }}><span className="uz-icon"><UploadCloud size={24} /></span><span className="uz-title">{file?.name ?? "Choose a reviewed document"}</span><span className="uz-sub">PDF, XLSX, CSV, DOCX or Markdown · maximum 12 MB</span></button>
        <input ref={fileInput} hidden type="file" accept={ACCEPT} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        <button className="btn primary" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} onClick={() => void submitUpload()} disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Upload to quarantine</button>
        {uploading && <div className="card" style={{ padding: 12, marginTop: 10, borderColor: "var(--brand-accent)" }}><div className="small" style={{ fontWeight: 800 }}><Loader2 size={13} className="spin" /> Uploading and inspecting the file</div><div className="cell-sub" style={{ marginTop: 5 }}>Checking filename, format, embedded content and malware before private storage. The page will then track extraction, validation, review and indexing.</div></div>}
      </section>
      <section className="span-2 card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-head" style={{ padding: "16px 18px" }}><h3>Source register</h3><span className="small muted">Immutable versions and audit history</span></div>
        {sources === null ? <div className="empty-state"><Loader2 className="spin" /><div className="e-title">Loading secure register…</div></div> : sources.length === 0 ? <div className="empty-state"><ShieldCheck size={28} /><div className="e-title">No governed sources yet</div><div className="small">Your first upload will remain quarantined until every check passes.</div></div> : <div className="table-wrap"><table className="data"><thead><tr><th /><th>Source</th><th>Type</th><th>Status</th><th>Uploaded</th></tr></thead><tbody>{sources.map((source) => {
          const open = source.id === expandedId; const version = open ? currentVersion(detail) : source.latest_version;
          return <RowGroup key={source.id}><tr className="row-hover" style={{ cursor: "pointer" }} onClick={() => void toggleDetail(source)}><td>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td><td><div className="cell-main">{source.title}</div><div className="cell-sub">{version?.original_name ?? "Preparing…"}</div>{version && <ProgressBar value={source.status === "release-pending" || source.status === "removal-pending" ? 90 : version.progress} />}</td><td className="small">{TYPE_LABELS[source.source_type]}</td><td><span className={`badge ${badgeClass(source.status)}`}>{["processing", "release-pending", "removal-pending"].includes(source.status) && <Loader2 size={11} className="spin" />}{STATUS_LABELS[source.status]}</span></td><td className="small nowrap">{source.created_at ? fmtDateTime(new Date(source.created_at).getTime()) : "—"}</td></tr>{open && <tr><td /><td colSpan={4} style={{ background: "var(--surface-hover)", padding: 16 }}>{detail && version ? <div style={{ display: "grid", gap: 14 }}><ReviewPanel source={detail} version={version} busy={busy} selectedFinding={findingId} onSelectFinding={setFindingId} note={resolutionNote} password={reviewPassword} onNote={setResolutionNote} onPassword={setReviewPassword} onResolve={() => void resolveFinding(detail, version)} releaseReason={releaseReason} releasePassword={releasePassword} onReleaseReason={setReleaseReason} onReleasePassword={setReleasePassword} onRelease={() => void release(detail, version)} onPreview={() => void openPreview(detail, version)} /><RemovalPanel source={detail} busy={busy} reason={removalReason} password={removalPassword} onReason={setRemovalReason} onPassword={setRemovalPassword} onRemove={() => void removeSource(detail)} /></div> : <Loader2 className="spin" />}</td></tr>}</RowGroup>;
        })}</tbody></table></div>}
      </section>
    </div>
    {previewOpen && <dialog
      ref={previewDialog}
      aria-label="Extracted content review"
      className="card knowledge-preview"
      onCancel={(event) => { event.preventDefault(); setPreviewOpen(false); }}
    ><div className="card-head knowledge-preview-head"><div><h3>Extracted content review</h3><div className="small muted">Read-only canonical chunks. Original formatting and formulas are never executed.</div></div><button className="btn sm knowledge-preview-close" onClick={() => setPreviewOpen(false)} aria-label="Close preview"><X size={18} /></button></div><div className="knowledge-preview-body">{["csv", "xlsx"].includes(previewExtension) ? <SpreadsheetPreview chunks={chunks} extension={previewExtension} /> : chunks.map((chunk) => <article key={chunk.id} className="knowledge-preview-chunk"><div className="small" style={{ fontWeight: 800 }}>{chunk.sequence}. {chunk.section || "General"}</div><div className="knowledge-preview-content">{chunk.content}</div></article>)}</div></dialog>}
  </main>;
}

function ReviewPanel(props: { source: KnowledgeSource; version: KnowledgeVersion; busy: boolean; selectedFinding: string | null; onSelectFinding: (id: string | null) => void; note: string; password: string; onNote: (value: string) => void; onPassword: (value: string) => void; onResolve: () => void; releaseReason: string; releasePassword: string; onReleaseReason: (value: string) => void; onReleasePassword: (value: string) => void; onRelease: () => void; onPreview: () => void }) {
  const { source, version } = props; const openFindings = version.findings.filter((finding) => !finding.resolved_at); const blocking = openFindings.filter((finding) => finding.blocks_release).length;
  const canRelease = version.status === "review-required" && version.scan_status === "passed" && version.extraction_status === "completed" && blocking === 0 && version.chunk_count > 0;
  return <div style={{ display: "grid", gap: 14 }}><ProcessingTimeline source={source} version={version} /><div className="grid cols-4"><Mini label="Security scan" value={version.scan_status} /><Mini label="Extraction" value={version.extraction_status} /><Mini label="Validation" value={version.validation_status} /><Mini label="Review chunks" value={fmtInt(version.chunk_count)} /></div><div className="small muted">Version {version.version} · {fmtBytes(Math.max(1, Math.round(version.size_bytes / 1024)))} · SHA-256 {version.sha256.slice(0, 14)}… · uploaded by {source.created_by ?? "System Administrator"}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn sm" onClick={props.onPreview} disabled={version.chunk_count === 0 || props.busy}><Eye size={14} /> Review extracted content</button><span className={`badge ${blocking ? "critical" : "good"}`}>{blocking ? `${blocking} release blocker${blocking === 1 ? "" : "s"}` : "No open release blockers"}</span></div>
    {openFindings.length > 0 && <div><div className="small" style={{ fontWeight: 800, marginBottom: 8 }}>Open findings</div><div style={{ display: "grid", gap: 8 }}>{openFindings.map((finding) => <FindingRow key={finding.id} finding={finding} selected={props.selectedFinding === finding.id} onSelect={props.onSelectFinding} />)}</div></div>}
    {props.selectedFinding && <div className="card" style={{ padding: 12 }}><div className="small" style={{ fontWeight: 800 }}>Record administrator resolution</div><textarea className="input" rows={2} value={props.note} onChange={(event) => props.onNote(event.target.value)} placeholder="Explain what was verified or corrected (required)" /><input className="input" type="password" value={props.password} onChange={(event) => props.onPassword(event.target.value)} placeholder="Current password" /><button className="btn amber sm" onClick={props.onResolve} disabled={props.busy}>Resolve selected finding</button></div>}
    <div className="card" style={{ padding: 12, borderColor: canRelease ? "var(--status-good)" : "var(--line)" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><LockKeyhole size={16} /><strong>Controlled release</strong></div><p className="small muted">Release is enabled only after a passed malware scan, completed extraction, full content review and resolution of all blocking findings.</p><textarea className="input" rows={2} value={props.releaseReason} onChange={(event) => props.onReleaseReason(event.target.value)} placeholder="Release reason (minimum 10 characters)" /><input className="input" type="password" value={props.releasePassword} onChange={(event) => props.onReleasePassword(event.target.value)} placeholder="Confirm current password" /><button className="btn primary sm" onClick={props.onRelease} disabled={!canRelease || props.busy}><CheckCircle2 size={14} /> Release for secure indexing</button></div></div>;
}

function FindingRow({ finding, selected, onSelect }: { finding: KnowledgeFinding; selected: boolean; onSelect: (id: string | null) => void }) {
  const locked = NON_OVERRIDABLE.has(finding.code);
  return <button type="button" className="card" onClick={() => !locked && onSelect(selected ? null : finding.id)} disabled={locked} style={{ padding: 10, textAlign: "left", opacity: locked ? .78 : 1, borderColor: selected ? "var(--brand-accent)" : undefined }}><div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><AlertTriangle size={15} style={{ color: finding.severity === "warning" ? "var(--status-warn)" : "var(--status-critical)", marginTop: 2 }} /><div><div className="small" style={{ fontWeight: 800 }}>{finding.message}</div><div className="cell-sub">{finding.code}{locked ? " · system correction required; cannot be overridden" : " · select to resolve"}</div></div></div></button>;
}
function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div title={`${safe}% complete`} style={{ width: "min(220px, 100%)", height: 5, marginTop: 7, borderRadius: 999, overflow: "hidden", background: "var(--line)" }}><div style={{ width: `${safe}%`, height: "100%", borderRadius: 999, background: "var(--brand-primary)", transition: "width .6s ease" }} /></div>;
}
function ProcessingTimeline({ source, version }: { source: KnowledgeSource; version: KnowledgeVersion }) {
  const extractionDone = version.extraction_status === "completed";
  const validationDone = ["passed", "issues-found"].includes(version.validation_status);
  const stages = [
    { label: "Received", done: true, active: version.progress <= 10 },
    { label: "Malware scan", done: version.scan_status === "passed", active: version.scan_status === "pending" },
    { label: "Safe extraction", done: extractionDone, active: version.extraction_status === "processing" },
    { label: "Rule validation", done: validationDone, active: version.validation_status === "processing" },
    { label: "Administrator review", done: Boolean(version.reviewed_at), active: source.status === "review-required" },
    { label: "AI indexing", done: source.status === "released", active: source.status === "release-pending" },
  ];
  return <div className="card" style={{ padding: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><strong className="small">Verification progress</strong><span className="small muted">{source.status === "released" ? "Complete" : `${source.status === "release-pending" ? 90 : version.progress}%`}</span></div><ProgressBar value={source.status === "release-pending" ? 90 : version.progress} /><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>{stages.map((stage) => <span key={stage.label} className={`badge ${stage.done ? "good" : stage.active ? "info" : ""}`}>{stage.active && !stage.done && <Loader2 size={10} className="spin" />}{stage.done && <CheckCircle2 size={10} />}{stage.label}</span>)}</div></div>;
}
function RemovalPanel({ source, busy, reason, password, onReason, onPassword, onRemove }: { source: KnowledgeSource; busy: boolean; reason: string; password: string; onReason: (value: string) => void; onPassword: (value: string) => void; onRemove: () => void }) {
  const indexed = source.active_version_id !== null || source.status === "released";
  const pending = source.status === "removal-pending";
  return <div className="card" style={{ padding: 12, borderColor: "var(--status-critical)" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Trash2 size={16} /><strong>Controlled removal</strong></div><p className="small muted">{indexed ? "The source will first be withdrawn from AI retrieval, then its protected record and private file will be removed. The audit event remains." : "This unreleased source and its private file can be permanently removed. The audit event remains."}</p>{!pending && <><textarea className="input" rows={2} value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Removal reason (minimum 10 characters)" /><input className="input" type="password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder="Confirm current password" /><button className="btn sm" style={{ color: "var(--status-critical)" }} onClick={onRemove} disabled={busy || reason.trim().length < 10 || password === ""}><Trash2 size={14} /> {indexed ? "Withdraw and remove" : "Permanently remove"}</button></>}{pending && <span className="badge info"><Loader2 size={11} className="spin" /> Withdrawal and removal are pending</span>}</div>;
}
function Mini({ label, value }: { label: string; value: string }) { return <div className="card" style={{ padding: 10 }}><div className="cell-sub" style={{ textTransform: "uppercase" }}>{label}</div><div className="cell-main" style={{ textTransform: "capitalize" }}>{value.replaceAll("-", " ")}</div></div>; }
function SpreadsheetPreview({ chunks, extension }: { chunks: KnowledgeChunk[]; extension: string }) {
  const rows = chunks.map((chunk) => {
    const cells: Record<string, string> = {};
    for (const line of chunk.content.split("\n")) {
      const separator = line.indexOf(":");
      if (separator < 1) continue;
      const rawKey = line.slice(0, separator).trim();
      const key = extension === "xlsx" ? rawKey.replace(/\d+$/, "") : rawKey;
      cells[key] = line.slice(separator + 1).trim();
    }
    return { id: chunk.id, label: chunk.section || `Row ${chunk.sequence}`, cells };
  });
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row.cells))));
  if (columns.length === 0) return <>{chunks.map((chunk) => <article key={chunk.id} className="knowledge-preview-chunk"><div className="small" style={{ fontWeight: 800 }}>{chunk.sequence}. {chunk.section || "General"}</div><div className="knowledge-preview-content">{chunk.content}</div></article>)}</>;
  return <div className="knowledge-sheet-wrap"><table className="knowledge-sheet"><thead><tr><th>Row</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{columns.map((column) => <td key={column}>{row.cells[column] ?? "—"}</td>)}</tr>)}</tbody></table></div>;
}
function RowGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }
