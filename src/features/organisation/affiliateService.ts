import { apiFetch } from '../../services/api';

export interface AffiliateInstitution {
  id: string;
  name: string;
  institution_type?: string;
  location?: string;
  affiliation_status?: string;
  offerings?: string;
  overview?: string;
  version: number;
}

export interface AffiliatePage {
  institutions: AffiliateInstitution[];
  meta: { currentPage: number; lastPage: number; perPage: number; total: number };
}

export async function fetchAffiliates(page: number, search: string): Promise<AffiliatePage> {
  const params = new URLSearchParams({ page: String(page), per_page: '20' });
  if (search.trim()) params.set('search', search.trim());
  const response = await apiFetch(`/api/v1/admin/affiliated-institutions?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Published affiliate institutions could not be loaded.');
  return {
    institutions: body.data,
    meta: {
      currentPage: body.meta.current_page,
      lastPage: body.meta.last_page,
      perPage: body.meta.per_page,
      total: body.meta.total,
    },
  };
}
