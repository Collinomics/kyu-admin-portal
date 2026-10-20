import { useState } from 'react';
import { KeyRound, UserCheck, UserX, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import type { UserAccount } from '../types';
import { roleLabels } from '../types';
import StatusBadge from './StatusBadge';
import KyEmpty from '../../../components/ui/KyEmpty';

const PER_PAGE = 5;

interface Props {
  users: UserAccount[];
  onToggleStatus: (id: string) => void;
  onResetPassword: (id: string) => void;
  onSelect: (user: UserAccount) => void;
  onDelete: (id: string) => void;
}

export default function UsersTable({ users, onToggleStatus, onResetPassword, onSelect, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<'status' | 'name' | 'createdAt'>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const toggleSort = (key: 'name' | 'createdAt') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...users].sort((a, b) => {
    if (sortKey === 'status') {
      const rank: Record<UserAccount['status'], number> = { pending: 0, active: 1, locked: 2, suspended: 3, inactive: 4 };
      const statusDifference = rank[a.status] - rank[b.status];
      if (statusDifference !== 0) return statusDifference;
      return b.createdAt.localeCompare(a.createdAt);
    }
    const av = sortKey === 'name' ? `${a.firstName} ${a.lastName}`.toLowerCase() : a.createdAt;
    const bv = sortKey === 'name' ? `${b.firstName} ${b.lastName}`.toLowerCase() : b.createdAt;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const pageRows = sorted.slice(start, start + PER_PAGE);

  const SortIcon = ({ col }: { col: 'name' | 'createdAt' }) =>
    sortKey !== col ? <ArrowUpDown size={12} className="text-gray-300" /> :
    sortDir === 'asc' ? <ArrowUp size={12} className="text-kyu-blue" /> : <ArrowDown size={12} className="text-kyu-blue" />;

  if (users.length === 0) {
    return <KyEmpty title="No accounts found" hint="Try a different search term or clear the filters — or create the account if it should exist." />;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-kyu-blue text-white">
            <tr>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1.5 font-semibold hover:text-kyu-orange">
                  Name <SortIcon col="name" />
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3">
                <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1.5 font-semibold hover:text-kyu-orange">
                  Created <SortIcon col="createdAt" />
                </button>
              </th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageRows.map((user) => (
              <tr
                key={user.id}
                onClick={() => onSelect(user)}
                title="Click to view account details"
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-kyu-blue/10 text-kyu-blue text-[11px] font-bold flex items-center justify-center shrink-0">
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{user.title} {user.firstName} {user.lastName}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{roleLabels[user.role]}</td>
                <td className="max-w-sm px-4 py-3 text-gray-600">
                  {(user.programmes?.length ?? 0) > 1 || (user.calls?.length ?? 0) > 1 ? <div>
                    <p className="line-clamp-2">{(user.programmes ?? user.calls ?? []).slice(0, 2).join(' · ')}</p>
                    {(user.programmes ?? user.calls ?? []).length > 2 && <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-kyu-blue">+{(user.programmes ?? user.calls ?? []).length - 2} more</span>}
                    <p className="mt-1 text-[11px] font-semibold text-gray-400">{(user.programmes ?? user.calls ?? []).length} assignments</p>
                  </div> : user.unit}
                </td>
                <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{user.createdAt}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    <button
                      title={user.status === 'pending' ? 'Resend activation code' : 'Send password reset link'}
                      onClick={() => onResetPassword(user.id)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-kyu-blue/10 hover:text-kyu-blue transition-colors"
                    >
                      <KeyRound size={16} />
                    </button>
                    {['inactive', 'suspended', 'locked'].includes(user.status) ? (
                      <button
                        title="Reactivate account"
                        onClick={() => onToggleStatus(user.id)}
                        className="p-2 rounded-lg text-gray-500 hover:bg-green-100 hover:text-green-700 transition-colors"
                      >
                        <UserCheck size={16} />
                      </button>
                    ) : user.status !== 'pending' ? (
                      <button
                        title="Deactivate account"
                        onClick={() => onToggleStatus(user.id)}
                        className="p-2 rounded-lg text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        <UserX size={16} />
                      </button>
                    ) : null}
                    {user.canDelete && <button
                      title="Permanently remove this unused account"
                      onClick={() => onDelete(user.id)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                    ><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>Showing {start + 1}–{Math.min(start + PER_PAGE, sorted.length)} of {sorted.length} accounts</span>
        <div className="flex items-center gap-2">
          <button
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono">Page {safePage} / {totalPages}</span>
          <button
            disabled={safePage === totalPages}
            onClick={() => setPage(safePage + 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
