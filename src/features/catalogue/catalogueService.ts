import { apiFetch } from '../../services/api';
import type { CatalogueResponse } from './types';
import type { PublicProgramme } from './types';
import { mapPublicCatalogueSettings } from '../settings/settingsService';

interface CatalogueQuery {
  page: number;
  search: string;
  category: string;
  facultyId: string;
}

export async function fetchCatalogue(query: CatalogueQuery, signal?: AbortSignal, fresh = false): Promise<CatalogueResponse> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.search.trim()) params.set('search', query.search.trim());
  if (query.category) params.set('category', query.category);
  if (query.facultyId) params.set('faculty_id', query.facultyId);
  const response = await apiFetch(`/api/v1/catalogue/programmes?${params}`, { signal, cache: fresh ? 'reload' : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.message ?? 'The programme catalogue could not be loaded.'));

  return {
    programmes: body.data,
    meta: {
      currentPage: Number(body.meta.current_page),
      lastPage: Number(body.meta.last_page),
      perPage: Number(body.meta.per_page),
      total: Number(body.meta.total),
      revision: String(body.meta.revision ?? ''),
    },
    summary: {
      publishedProgrammes: Number(body.summary.published_programmes),
      academicUnits: Number(body.summary.academic_units),
      callsClosingSoon: Number(body.summary.calls_closing_soon),
    },
    filters: { faculties: body.filters.faculties, categories: body.filters.categories },
    configuration: mapPublicCatalogueSettings(body.configuration),
  };
}

export async function fetchCatalogueRevision(signal?: AbortSignal): Promise<string> {
  const response = await apiFetch('/api/v1/catalogue/revision', { signal, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.message ?? 'The catalogue revision could not be checked.'));
  return String(body.data?.revision ?? '');
}

export async function fetchPublicProgramme(id: string, signal?: AbortSignal, fresh = false): Promise<PublicProgramme> {
  const response = await apiFetch(`/api/v1/catalogue/programmes/${encodeURIComponent(id)}`, { signal, cache: fresh ? 'reload' : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.message ?? 'The programme could not be loaded.'));
  return body.data as PublicProgramme;
}
