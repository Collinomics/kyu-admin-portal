import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, BookOpen, CloudCog, Eye, Globe2, KeyRound, Palette, RotateCcw, Settings2, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { DEFAULT_PUBLIC_CATALOGUE_SETTINGS, fetchAdminSystemSettings, fetchManagedCredentialStatuses, replaceManagedCredential, updateAdminSystemSettings, type AdminSystemSettings, type ManagedCredentialStatus, type PublicCatalogueSettings } from './settingsService';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import KyConfirm from '../../components/ui/KyConfirm';
import KyBadge from '../../components/ui/KyBadge';
import { KyInput, KySelect, KyTextarea } from '../../components/ui/KyField';
import { useToast } from '../../components/ui/KyToast';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSystemSettings | null>(null);
  const [closingSoonDays, setClosingSoonDays] = useState('7');
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [backgroundRefreshEnabled, setBackgroundRefreshEnabled] = useState(true);
  const [operationalRefreshSeconds, setOperationalRefreshSeconds] = useState('10');
  const [adminRefreshSeconds, setAdminRefreshSeconds] = useState('15');
  const [catalogueSettings, setCatalogueSettings] = useState<PublicCatalogueSettings>(DEFAULT_PUBLIC_CATALOGUE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [credentials, setCredentials] = useState<ManagedCredentialStatus[]>([]);
  const [credentialError, setCredentialError] = useState('');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialReason, setCredentialReason] = useState('');
  const [rotatingCredential, setRotatingCredential] = useState<ManagedCredentialStatus | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAdminSystemSettings()
      .then((data) => {
        setSettings(data);
        setClosingSoonDays(String(data.closingSoonDays));
        setSessionTimeout(String(data.sessionTimeoutMinutes));
        setBackgroundRefreshEnabled(data.backgroundRefreshEnabled);
        setOperationalRefreshSeconds(String(data.operationalRefreshSeconds));
        setAdminRefreshSeconds(String(data.adminRefreshSeconds));
        setCatalogueSettings(data.publicCatalogue);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'System settings could not be loaded.'))
      .finally(() => setLoading(false));
    fetchManagedCredentialStatuses()
      .then(setCredentials)
      .catch((reason) => setCredentialError(reason instanceof Error ? reason.message : 'Secure credential status could not be loaded.'));
  }, []);

  const requestSave = () => {
    const closing = Number(closingSoonDays);
    const timeout = Number(sessionTimeout);
    if (!Number.isInteger(closing) || closing < 1 || closing > 60) {
      toast('Closing Soon must be a whole number between 1 and 60 days.', 'error');
      return;
    }
    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 240) {
      toast('Session timeout must be a whole number between 5 and 240 minutes.', 'error');
      return;
    }
    const operationalRefresh = Number(operationalRefreshSeconds);
    const adminRefresh = Number(adminRefreshSeconds);
    if (!Number.isInteger(operationalRefresh) || operationalRefresh < 3 || operationalRefresh > 300) {
      toast('Operational refresh must be a whole number between 3 and 300 seconds.', 'error');
      return;
    }
    if (!Number.isInteger(adminRefresh) || adminRefresh < 3 || adminRefresh > 300) {
      toast('Admin-list refresh must be a whole number between 3 and 300 seconds.', 'error');
      return;
    }
    if (!Number.isInteger(catalogueSettings.backgroundRefreshSeconds) || catalogueSettings.backgroundRefreshSeconds < 10 || catalogueSettings.backgroundRefreshSeconds > 600) {
      toast('Public catalogue refresh must be between 10 and 600 seconds.', 'error');
      return;
    }
    if (!catalogueSettings.heroBadge.trim() || !catalogueSettings.heroTitle.trim() || !catalogueSettings.heroAccent.trim() || !catalogueSettings.heroDescription.trim()) {
      toast('Complete all public catalogue heading fields before saving.', 'error');
      return;
    }
    try {
      const url = new URL(catalogueSettings.applicationPortalUrl);
      if (url.protocol !== 'https:') throw new Error();
    } catch {
      toast('The application portal must be a complete secure HTTPS address.', 'error');
      return;
    }
    setConfirming(true);
  };

  const save = async (password?: string) => {
    const updated = await updateAdminSystemSettings({
      closingSoonDays: Number(closingSoonDays),
      sessionTimeoutMinutes: Number(sessionTimeout),
      backgroundRefreshEnabled,
      operationalRefreshSeconds: Number(operationalRefreshSeconds),
      adminRefreshSeconds: Number(adminRefreshSeconds),
      publicCatalogue: catalogueSettings,
    }, password ?? '');
    setSettings(updated);
    setBackgroundRefreshEnabled(updated.backgroundRefreshEnabled);
    setOperationalRefreshSeconds(String(updated.operationalRefreshSeconds));
    setAdminRefreshSeconds(String(updated.adminRefreshSeconds));
    setCatalogueSettings(updated.publicCatalogue);
    setConfirming(false);
    toast('Shared system settings saved and recorded in the Audit Log.', 'success');
  };

  const requestCredentialRotation = (credential: ManagedCredentialStatus) => {
    if (credentialValue.trim().length < 20) {
      toast('Enter the complete replacement credential (at least 20 characters).', 'error');
      return;
    }
    if (credentialReason.trim().length < 8) {
      toast('Enter a short reason for this credential change.', 'error');
      return;
    }
    setRotatingCredential(credential);
  };

  const rotateCredential = async (password?: string) => {
    if (!rotatingCredential) return;
    const updated = await replaceManagedCredential(
      rotatingCredential.key,
      credentialValue,
      credentialReason,
      password ?? '',
    );
    setCredentials((current) => current.map((item) => item.key === updated.key ? updated : item));
    setCredentialValue('');
    setCredentialReason('');
    setRotatingCredential(null);
    toast('Credential replaced securely. Its value is never displayed or retained by the portal.', 'success');
  };

  return (
    <div className="space-y-6">
      <KyPageHeader title="System Settings" subtitle="Shared operational policy for KYU PCS" />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3"><p className="text-sm text-red-700">{error}</p><KyButton size="sm" variant="outline" onClick={() => window.location.reload()}>Reload</KyButton></div>}

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Loading shared settings…</div> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Timer size={17} className="text-kyu-orange-dark" /> Operational timing</h3>
                <p className="text-[11px] text-gray-400 mt-1">These values apply across browsers and staff accounts.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KyInput label="Closing Soon threshold" help="Days before an admissions deadline (1–60)." type="number" min={1} max={60} value={closingSoonDays} onChange={(event) => setClosingSoonDays(event.target.value)} />
                <KyInput label="Inactive session timeout" help="Minutes before the portal warning appears (5–240)." type="number" min={5} max={240} value={sessionTimeout} onChange={(event) => setSessionTimeout(event.target.value)} />
                <KyInput label="Operational refresh" help="Seconds for dashboards and admissions (3–300)." type="number" min={3} max={300} value={operationalRefreshSeconds} onChange={(event) => setOperationalRefreshSeconds(event.target.value)} />
                <KyInput label="Admin-list refresh" help="Seconds for accounts, programmes and organisation data (3–300)." type="number" min={3} max={300} value={adminRefreshSeconds} onChange={(event) => setAdminRefreshSeconds(event.target.value)} />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <input type="checkbox" checked={backgroundRefreshEnabled} onChange={(event) => setBackgroundRefreshEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-kyu-blue" />
                <span><span className="block text-xs font-bold text-blue-900">Silent background refresh</span><span className="mt-0.5 block text-[10px] leading-4 text-blue-700">Pauses in hidden tabs and while offline, prevents overlapping requests, and automatically backs off after failures.</span></span>
              </label>
              <div className="flex justify-end"><KyButton onClick={requestSave}>Review & Save Settings</KyButton></div>
            </section>

            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Settings2 size={17} className="text-kyu-blue" /> Enforced security policy</h3>
              <ul className="text-[12px] text-gray-500 space-y-2">
                <li>• Portal inactivity warning after <strong>{settings?.sessionTimeoutMinutes ?? 30} minutes</strong>.</li>
                <li>• Account lock after <strong>{settings?.maxFailedLoginAttempts ?? 5} consecutive failed sign-in attempts</strong>.</li>
                <li>• Password confirmation is required before changing system settings.</li>
                <li>• Every configuration change is written to the append-only Audit Log.</li>
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><CloudCog size={17} className="text-kyu-blue" /> System backup & restoration</h3>
                <KyBadge tone="orange">Provider managed</KyBadge>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Portal backup connector is not configured</p>
                  <p className="text-xs text-amber-800 mt-1">The previous backup history and manual controls were demonstrations and did not perform a real backup or restoration. They have been removed so the portal never reports an operation that did not happen.</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Backup controls can be enabled later after a secure provider-side backup service, encrypted storage destination and restore runbook are configured on the deployment server.</p>
            </section>

            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Sparkles size={17} /> AI Navigation configuration</h3>
              <p className="text-[11px] text-gray-500 mt-1">Configure the assistant, guardrails, visitor messages and knowledge sources in the AI Monitor.</p>
              <Link to="/admin/ai-monitor/settings" className="mt-4 inline-flex items-center rounded-lg bg-kyu-blue px-4 py-2 text-xs font-bold text-white hover:bg-kyu-blue-dark">Open AI Settings</Link>
            </section>
          </div>
        </div>
      )}

      {!loading && <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-[#0E3F73] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={19} /> Secure credentials</h2>
            <p className="mt-1 text-xs text-blue-100">Replace approved integration credentials without opening source code or revealing saved values.</p>
          </div>
          <KyBadge tone="yellow">System Administrator only</KyBadge>
        </div>
        <div className="p-5">
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
            Approved integration credentials are protected outside the portal and accessed only through a restricted server identity. Existing values are never displayed, and core infrastructure credentials are deliberately excluded from this screen.
          </div>
          {credentialError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{credentialError}</div>}
          {credentials.map((credential) => {
            const ready = credential.state === 'ready';
            return <div key={credential.key} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800"><KeyRound size={17} className="text-kyu-orange-dark" /> {credential.label}</h3>
                  <p className="mt-1 text-xs text-gray-500">{credential.description}</p>
                  <p className="mt-2 text-[11px] text-gray-400">Provider: {credential.provider}{credential.lastChangedAt ? ` · Last replaced ${new Date(credential.lastChangedAt).toLocaleString()}` : ''}</p>
                </div>
                <KyBadge tone={ready ? 'green' : credential.state === 'unavailable' ? 'red' : 'orange'}>
                  {ready ? 'Connected' : credential.state === 'unavailable' ? 'Provider unavailable' : 'Server setup required'}
                </KyBadge>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <KyInput
                  type="password" autoComplete="new-password" label="New credential value"
                  help="Write-only: it is cleared after saving and can never be retrieved here."
                  placeholder="Paste the complete replacement key"
                  value={credentialValue} disabled={!ready}
                  onChange={(event) => setCredentialValue(event.target.value)}
                />
                <KyInput
                  label="Reason for change" maxLength={500}
                  placeholder="Example: scheduled quarterly rotation"
                  value={credentialReason} disabled={!ready}
                  onChange={(event) => setCredentialReason(event.target.value)}
                />
                <KyButton disabled={!ready} icon={<RotateCcw size={15} />} onClick={() => requestCredentialRotation(credential)}>Review & Replace</KyButton>
              </div>
              {!ready && <p className="mt-3 text-[11px] font-medium text-amber-700">An infrastructure administrator must first connect this deployment to the approved protected credential.</p>}
            </div>;
          })}
        </div>
      </section>}

      {!loading && settings && <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gradient-to-r from-[#0E3F73] to-[#1B5EA9] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold"><Globe2 size={19} /> Public Catalogue</h2>
            <p className="mt-1 text-xs text-blue-100">Control public wording, visibility, page size, links and academic-unit colours.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold"><Eye size={14} /> Changes appear after saving</span>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-2">
          <div className="space-y-5">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700"><BookOpen size={17} className="text-kyu-orange-dark" /> Hero content</h3>
              <p className="mt-1 text-[11px] text-gray-400">Keep this concise so it remains readable on phones.</p>
            </div>
            <KyInput label="Official badge text" maxLength={60} value={catalogueSettings.heroBadge} onChange={(event) => setCatalogueSettings((current) => ({ ...current, heroBadge: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <KyInput label="Main heading" maxLength={90} value={catalogueSettings.heroTitle} onChange={(event) => setCatalogueSettings((current) => ({ ...current, heroTitle: event.target.value }))} />
              <KyInput label="Highlighted heading" maxLength={90} value={catalogueSettings.heroAccent} onChange={(event) => setCatalogueSettings((current) => ({ ...current, heroAccent: event.target.value }))} />
            </div>
            <KyTextarea label="Introductory description" maxLength={240} rows={3} value={catalogueSettings.heroDescription} onChange={(event) => setCatalogueSettings((current) => ({ ...current, heroDescription: event.target.value }))} />
            <KyInput label="Official application portal" help="Only secure HTTPS links are accepted." type="url" value={catalogueSettings.applicationPortalUrl} onChange={(event) => setCatalogueSettings((current) => ({ ...current, applicationPortalUrl: event.target.value }))} />
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700"><Settings2 size={17} className="text-kyu-blue" /> Display behaviour</h3>
              <p className="mt-1 text-[11px] text-gray-400">These options affect every public visitor.</p>
            </div>
            <KySelect label="Programmes per page" value={catalogueSettings.resultsPerPage} onChange={(event) => setCatalogueSettings((current) => ({ ...current, resultsPerPage: Number(event.target.value) as PublicCatalogueSettings['resultsPerPage'] }))}>
              {[6, 9, 12, 18, 24].map((count) => <option key={count} value={count}>{count} programmes</option>)}
            </KySelect>
            <KyInput label="Public background refresh" help="Seconds between silent catalogue checks (10–600)." type="number" min={10} max={600} value={catalogueSettings.backgroundRefreshSeconds} onChange={(event) => setCatalogueSettings((current) => ({ ...current, backgroundRefreshSeconds: Number(event.target.value) }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['showHeroStatistics', 'Hero statistics', 'Programme and academic-unit totals'],
                ['showCardDescriptions', 'Card descriptions', 'Short non-repetitive summaries'],
                ['showBookmarks', 'Bookmarks', 'Visitor shortlist stored on-device'],
                ['showApplicationLinks', 'Application links', 'Apply actions and footer link'],
              ] as const).map(([key, label, help]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 transition hover:border-blue-200">
                <input type="checkbox" checked={catalogueSettings[key]} onChange={(event) => setCatalogueSettings((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-kyu-blue" />
                <span><span className="block text-xs font-bold text-gray-700">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-gray-400">{help}</span></span>
              </label>)}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-[#f6f8fb] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Hero preview</p>
              <div className="mt-3 rounded-xl bg-[#0E3F73] p-4 text-white shadow-sm">
                <span className="text-[8px] font-bold uppercase tracking-wider text-amber-300">{catalogueSettings.heroBadge || 'Badge text'}</span>
                <p className="mt-2 text-xl font-extrabold leading-tight">{catalogueSettings.heroTitle || 'Main heading'}<br /><span className="text-amber-300">{catalogueSettings.heroAccent || 'Highlighted heading'}</span></p>
                <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-blue-100">{catalogueSettings.heroDescription}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 p-5">
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700"><Palette size={17} className="text-kyu-orange-dark" /> Academic-unit card colours</h3>
            <p className="mt-1 text-[11px] text-gray-400">Each colour identifies programmes from that faculty or school. Unassigned units use the standard KYU blue.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {settings.catalogueAcademicUnits.map((unit) => {
              const colour = catalogueSettings.academicUnitColours[unit.id] ?? '#0E3F73';
              return <label key={unit.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                <input type="color" value={colour} onChange={(event) => setCatalogueSettings((current) => ({ ...current, academicUnitColours: { ...current.academicUnitColours, [unit.id]: event.target.value.toUpperCase() } }))} className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" aria-label={`Colour for ${unit.name}`} />
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-gray-700" title={unit.name}>{unit.name}</span><span className="mt-0.5 block font-mono text-[10px] text-gray-400">{colour.toUpperCase()}</span></span>
              </label>;
            })}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <KyButton variant="outline" icon={<RotateCcw size={15} />} onClick={() => setCatalogueSettings({ ...DEFAULT_PUBLIC_CATALOGUE_SETTINGS, academicUnitColours: {} })}>Restore catalogue defaults</KyButton>
            <KyButton onClick={requestSave}>Save All Settings</KyButton>
          </div>
        </div>
      </section>}

      {confirming && <KyConfirm
        open stepUp title="Save shared system settings?"
        message="Operational policy and public catalogue presentation may change for all users. Re-enter your password to confirm and record the change."
        confirmLabel="Save Settings" onConfirm={save} onCancel={() => setConfirming(false)}
      />}
      {rotatingCredential && <KyConfirm
        open stepUp title={`Replace ${rotatingCredential.label}?`}
        message="This immediately creates a new protected secret version for the application. The old value will not be displayed. Re-enter your password to authorise and audit the rotation."
        confirmLabel="Replace Credential" onConfirm={rotateCredential} onCancel={() => setRotatingCredential(null)}
      />}
    </div>
  );
}
