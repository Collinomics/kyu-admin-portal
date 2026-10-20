import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyBadge from '../../components/ui/KyBadge';
import KyButton from '../../components/ui/KyButton';
import { fetchRoleMatrix, type Capability, type RoleMatrixResponse } from './roleService';

const capTone: Record<Capability, 'green' | 'orange' | 'red'> = { yes: 'green', scoped: 'orange', no: 'red' };
const capLabel: Record<Capability, string> = { yes: 'Yes', scoped: 'Scoped', no: 'No' };

export default function RolesPage() {
  const [matrix, setMatrix] = useState<RoleMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchRoleMatrix()
      .then(setMatrix)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'The role policy could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <KyPageHeader title="Roles & Permissions" subtitle="The access policy currently enforced by the PCS server" />

      <section className="rounded-xl border border-kyu-blue/20 bg-kyu-blue/5 p-4 flex items-start gap-3">
        <ShieldCheck size={20} className="text-kyu-blue shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-kyu-blue">Protected role policy</p>
          <p className="mt-1 text-xs text-gray-600">Role-wide permissions are enforced by the backend and are read-only here. Individual scope is delegated in User Management and Admissions, so a “Scoped” permission only applies to the member’s assigned faculty, department, programme or application call.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <span><KyBadge tone="green">Yes</KyBadge> Full role access</span>
            <span><KyBadge tone="orange">Scoped</KyBadge> Assigned records only</span>
            <span><KyBadge tone="red">No</KyBadge> Server denies access</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <KyButton size="sm" variant="outline" onClick={load}><RefreshCw size={14} /> Retry</KyButton>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-14 text-center text-sm text-gray-500">Loading the enforced role policy…</div>
        ) : matrix && (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700"><LockKeyhole size={16} className="text-kyu-orange-dark" /> Server-enforced capabilities</div>
              <span className="text-[11px] text-gray-400">{matrix.capabilities.length} policy rules</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="bg-kyu-blue text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold md:sticky md:left-0 bg-kyu-blue md:z-10">Capability</th>
                    {matrix.roles.map((role) => <th key={role.id} className="px-3 py-3 text-center font-semibold" title={role.label}>{role.short_label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matrix.capabilities.map((row) => (
                    <tr key={row.id} className="group hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 font-medium md:sticky md:left-0 bg-white group-hover:bg-gray-50">{row.name}</td>
                      {matrix.roles.map((role) => {
                        const capability = row.roles[role.id.toLowerCase()] ?? 'no';
                        return <td key={role.id} className="px-3 py-3 text-center"><KyBadge tone={capTone[capability]}>{capLabel[capability]}</KyBadge></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
