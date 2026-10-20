import { useEffect, useRef, useState } from 'react';
import { Building2, MapPin, Search } from 'lucide-react';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyBadge from '../../components/ui/KyBadge';
import KyButton from '../../components/ui/KyButton';
import KyEmpty from '../../components/ui/KyEmpty';
import { fetchAffiliates, type AffiliateInstitution } from './affiliateService';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { prefetchApi } from '../../services/api';

export default function AffiliatesPage() {
  const [institutions, setInstitutions] = useState<AffiliateInstitution[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ currentPage: 1, lastPage: 1, perPage: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshSignatureRef = useRef('');
  refreshSignatureRef.current = `${page}|${search}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchAffiliates(page, search)
        .then((result) => { setInstitutions(result.institutions); setMeta(result.meta); setError(''); })
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Published affiliate institutions could not be loaded.'))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [page, search]);

  useBackgroundRefresh(async () => {
    const signature = `${page}|${search}`;
    const result = await fetchAffiliates(page, search);
    if (refreshSignatureRef.current !== signature) return;
    setInstitutions(result.institutions);
    setMeta(result.meta);
    setError('');
  }, 'standard');

  useEffect(() => {
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > meta.lastPage) continue;
      const params = new URLSearchParams({ page: String(targetPage), per_page: '20' });
      if (search.trim()) params.set('search', search.trim());
      void prefetchApi(`/api/v1/admin/affiliated-institutions?${params}`);
    }
  }, [page, meta.lastPage, search]);

  return <div className="space-y-6">
    <KyPageHeader title="Published Affiliate Institutions" subtitle="Canonical affiliated-institution records currently available to the AI catalogue" />
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      Showing {meta.total} published affiliate institutions. This is a read-only verification view of the imported canonical records.
    </div>
    <label className="relative block max-w-2xl">
      <span className="sr-only">Search affiliate institutions</span>
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name, type, location or affiliation status…" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-kyu-blue" />
    </label>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Loading published affiliate institutions…</div>
      : institutions.length === 0 ? <KyEmpty icon={<Building2 size={26} />} title="No affiliate institutions found" hint="Try another search term." />
        : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{institutions.map((institution) => <article key={institution.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-bold text-gray-800">{institution.name}</h2>{institution.location && <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><MapPin size={13} /> {institution.location}</p>}</div><KyBadge tone="green">Published</KyBadge></div>
          <div className="mt-3 flex flex-wrap gap-2">{institution.institution_type && <KyBadge tone="blue">{institution.institution_type}</KyBadge>}{institution.affiliation_status && <KyBadge tone="gray">{institution.affiliation_status}</KyBadge>}</div>
          {institution.offerings && <p className="mt-3 text-sm text-gray-700"><span className="font-semibold">Offerings:</span> {institution.offerings}</p>}
          {institution.overview && <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">{institution.overview}</p>}
        </article>)}</div>}
    {!loading && meta.total > 0 && <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 sm:flex-row">
      <span>Page {meta.currentPage} of {meta.lastPage} · {meta.total} published affiliates</span>
      <div className="flex gap-2"><KyButton size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</KyButton><KyButton size="sm" variant="outline" disabled={page >= meta.lastPage} onClick={() => setPage((value) => value + 1)}>Next</KyButton></div>
    </div>}
  </div>;
}
