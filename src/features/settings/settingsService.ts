import { apiFetch } from '../../services/api';

export interface RuntimeSettings {
  closingSoonDays: number;
  sessionTimeoutMinutes: number;
  maxFailedLoginAttempts: number;
  backgroundRefreshEnabled: boolean;
  operationalRefreshSeconds: number;
  adminRefreshSeconds: number;
}

export interface AdminSystemSettings extends RuntimeSettings {
  backupManagement: 'provider-managed';
  backupPortalConnected: boolean;
  publicCatalogue: PublicCatalogueSettings;
  catalogueAcademicUnits: Array<{ id: string; name: string }>;
}

export interface PublicCatalogueSettings {
  heroBadge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  resultsPerPage: 6 | 9 | 12 | 18 | 24;
  showHeroStatistics: boolean;
  showCardDescriptions: boolean;
  showBookmarks: boolean;
  showApplicationLinks: boolean;
  applicationPortalUrl: string;
  backgroundRefreshSeconds: number;
  backgroundRefreshEnabled: boolean;
  academicUnitColours: Record<string, string>;
}

export interface ManagedCredentialStatus {
  key: string;
  label: string;
  description: string;
  provider: string;
  configured: boolean;
  available: boolean;
  state: 'ready' | 'not-connected' | 'unavailable';
  lastChangedAt: string | null;
}

interface RawManagedCredentialStatus {
  key: string;
  label: string;
  description: string;
  provider: string;
  configured: boolean;
  available: boolean;
  state: ManagedCredentialStatus['state'];
  last_changed_at: string | null;
}

export const DEFAULT_PUBLIC_CATALOGUE_SETTINGS: PublicCatalogueSettings = {
  heroBadge: 'Official published catalogue',
  heroTitle: 'Choose a programme.',
  heroAccent: 'Build what comes next.',
  heroDescription: 'Explore verified programmes, entry requirements, career pathways and live application windows—all in one place.',
  resultsPerPage: 12,
  showHeroStatistics: true,
  showCardDescriptions: true,
  showBookmarks: true,
  showApplicationLinks: true,
  applicationPortalUrl: 'https://apply.kyu.ac.ug',
  backgroundRefreshSeconds: 30,
  backgroundRefreshEnabled: true,
  academicUnitColours: {},
};

interface RawSettings {
  closing_soon_days: number;
  session_timeout_minutes: number;
  max_failed_login_attempts: number;
  background_refresh_enabled?: boolean;
  operational_refresh_seconds?: number;
  admin_refresh_seconds?: number;
  backup_management?: 'provider-managed';
  backup_portal_connected?: boolean;
  public_catalogue?: RawPublicCatalogueSettings;
  catalogue_academic_units?: Array<{ id: string; name: string }>;
}

interface RawPublicCatalogueSettings {
  hero_badge?: string;
  hero_title?: string;
  hero_accent?: string;
  hero_description?: string;
  results_per_page?: number;
  show_hero_statistics?: boolean;
  show_card_descriptions?: boolean;
  show_bookmarks?: boolean;
  show_application_links?: boolean;
  application_portal_url?: string;
  background_refresh_seconds?: number;
  background_refresh_enabled?: boolean;
  academic_unit_colours?: Record<string, string>;
}

export function mapPublicCatalogueSettings(raw?: RawPublicCatalogueSettings): PublicCatalogueSettings {
  return {
    heroBadge: raw?.hero_badge ?? DEFAULT_PUBLIC_CATALOGUE_SETTINGS.heroBadge,
    heroTitle: raw?.hero_title ?? DEFAULT_PUBLIC_CATALOGUE_SETTINGS.heroTitle,
    heroAccent: raw?.hero_accent ?? DEFAULT_PUBLIC_CATALOGUE_SETTINGS.heroAccent,
    heroDescription: raw?.hero_description ?? DEFAULT_PUBLIC_CATALOGUE_SETTINGS.heroDescription,
    resultsPerPage: ([6, 9, 12, 18, 24].includes(Number(raw?.results_per_page)) ? Number(raw?.results_per_page) : 12) as PublicCatalogueSettings['resultsPerPage'],
    showHeroStatistics: raw?.show_hero_statistics ?? true,
    showCardDescriptions: raw?.show_card_descriptions ?? true,
    showBookmarks: raw?.show_bookmarks ?? true,
    showApplicationLinks: raw?.show_application_links ?? true,
    applicationPortalUrl: raw?.application_portal_url ?? DEFAULT_PUBLIC_CATALOGUE_SETTINGS.applicationPortalUrl,
    backgroundRefreshSeconds: Math.max(10, Math.min(600, Number(raw?.background_refresh_seconds ?? 30))),
    backgroundRefreshEnabled: raw?.background_refresh_enabled ?? true,
    academicUnitColours: raw?.academic_unit_colours ?? {},
  };
}

function serializePublicCatalogue(settings: PublicCatalogueSettings): RawPublicCatalogueSettings {
  return {
    hero_badge: settings.heroBadge,
    hero_title: settings.heroTitle,
    hero_accent: settings.heroAccent,
    hero_description: settings.heroDescription,
    results_per_page: settings.resultsPerPage,
    show_hero_statistics: settings.showHeroStatistics,
    show_card_descriptions: settings.showCardDescriptions,
    show_bookmarks: settings.showBookmarks,
    show_application_links: settings.showApplicationLinks,
    application_portal_url: settings.applicationPortalUrl,
    background_refresh_seconds: settings.backgroundRefreshSeconds,
    academic_unit_colours: settings.academicUnitColours,
  };
}

function mapRuntime(raw: RawSettings): RuntimeSettings {
  return {
    closingSoonDays: Number(raw.closing_soon_days),
    sessionTimeoutMinutes: Number(raw.session_timeout_minutes),
    maxFailedLoginAttempts: Number(raw.max_failed_login_attempts),
    backgroundRefreshEnabled: raw.background_refresh_enabled ?? true,
    operationalRefreshSeconds: Number(raw.operational_refresh_seconds ?? 10),
    adminRefreshSeconds: Number(raw.admin_refresh_seconds ?? 15),
  };
}

async function request(path: string, init?: RequestInit): Promise<RawSettings> {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'System settings could not be loaded.'));
  }
  return body.data as RawSettings;
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  return mapRuntime(await request('/api/v1/system-settings/runtime'));
}

export async function fetchAdminSystemSettings(): Promise<AdminSystemSettings> {
  const raw = await request('/api/v1/admin/system-settings');
  return {
    ...mapRuntime(raw),
    backupManagement: raw.backup_management ?? 'provider-managed',
    backupPortalConnected: Boolean(raw.backup_portal_connected),
    publicCatalogue: mapPublicCatalogueSettings(raw.public_catalogue),
    catalogueAcademicUnits: raw.catalogue_academic_units ?? [],
  };
}

export async function updateAdminSystemSettings(settings: Pick<RuntimeSettings, 'closingSoonDays' | 'sessionTimeoutMinutes' | 'backgroundRefreshEnabled' | 'operationalRefreshSeconds' | 'adminRefreshSeconds'> & { publicCatalogue: PublicCatalogueSettings }, currentPassword: string): Promise<AdminSystemSettings> {
  const raw = await request('/api/v1/admin/system-settings', {
    method: 'PATCH',
    body: JSON.stringify({
      closing_soon_days: settings.closingSoonDays,
      session_timeout_minutes: settings.sessionTimeoutMinutes,
      background_refresh_enabled: settings.backgroundRefreshEnabled,
      operational_refresh_seconds: settings.operationalRefreshSeconds,
      admin_refresh_seconds: settings.adminRefreshSeconds,
      public_catalogue: serializePublicCatalogue(settings.publicCatalogue),
      current_password: currentPassword,
    }),
  });
  const updated = {
    ...mapRuntime(raw),
    backupManagement: raw.backup_management ?? 'provider-managed' as const,
    backupPortalConnected: Boolean(raw.backup_portal_connected),
    publicCatalogue: mapPublicCatalogueSettings(raw.public_catalogue),
    catalogueAcademicUnits: raw.catalogue_academic_units ?? [],
  };
  window.dispatchEvent(new CustomEvent('kyu:runtime-settings-updated', { detail: updated }));
  return updated;
}

function mapManagedCredential(raw: RawManagedCredentialStatus): ManagedCredentialStatus {
  return {
    key: raw.key,
    label: raw.label,
    description: raw.description,
    provider: raw.provider,
    configured: Boolean(raw.configured),
    available: Boolean(raw.available),
    state: raw.state,
    lastChangedAt: raw.last_changed_at,
  };
}

export async function fetchManagedCredentialStatuses(): Promise<ManagedCredentialStatus[]> {
  const response = await apiFetch('/api/v1/admin/system-settings/secrets');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.message ?? 'Secure credential status could not be loaded.'));
  return ((body.data ?? []) as RawManagedCredentialStatus[]).map(mapManagedCredential);
}

export async function replaceManagedCredential(key: string, value: string, changeReason: string, currentPassword: string): Promise<ManagedCredentialStatus> {
  const response = await apiFetch(`/api/v1/admin/system-settings/secrets/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, change_reason: changeReason, current_password: currentPassword }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? body.message ?? 'The credential could not be replaced.'));
  }
  return mapManagedCredential(body.data as RawManagedCredentialStatus);
}
