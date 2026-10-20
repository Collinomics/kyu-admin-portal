import { apiFetch } from './api';

export type GlobalSearchResultType = 'user' | 'programme' | 'call';

export interface GlobalSearchResult {
  id: string;
  type: GlobalSearchResultType;
  label: string;
  sub: string;
  search: string;
}

export async function searchPortal(query: string, signal?: AbortSignal): Promise<GlobalSearchResult[]> {
  const response = await apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Search is temporarily unavailable.');

  return body.data as GlobalSearchResult[];
}
