import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, UserPlus, Users, UserCheck, Hourglass, KeyRound, ExternalLink } from 'lucide-react';
import type { CreateUserInput, OnboardingInvitation, UserAccount, UserManagementOptions, UserRole, UserStatus } from './types';
import { roleLabels } from './types';
import UsersTable from './components/UsersTable';
import CreateAccountModal from './components/CreateAccountModal';
import AccountDrawer from './components/AccountDrawer';
import AddAssignmentsModal from './components/AddAssignmentsModal';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import KyStatCard from '../../components/ui/KyStatCard';
import KyConfirm from '../../components/ui/KyConfirm';
import { KySelect } from '../../components/ui/KyField';
import { useToast } from '../../components/ui/KyToast';
import { addUserAssignments, changeUserStatus, createUser, deleteUserAccount, fetchUserOptions, fetchUsers, issuePasswordReset } from './userService';
import { useAuth } from '../auth/AuthContext';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';

type ConfirmState = { kind: 'deactivate' | 'suspend' | 'reactivate' | 'reset' | 'delete'; user: UserAccount } | null;

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [options, setOptions] = useState<UserManagementOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const search = searchParams.get('search') ?? '';
  const targetId = searchParams.get('target');
  const requestedRole = searchParams.get('role');
  const requestedStatus = searchParams.get('status');
  const roleFilter: 'all' | UserRole = requestedRole && requestedRole in roleLabels ? requestedRole as UserRole : 'all';
  const statusFilter: 'all' | UserStatus = ['active', 'pending', 'locked', 'suspended', 'inactive'].includes(requestedStatus ?? '') ? requestedStatus as UserStatus : 'all';
  const [selected, setSelected] = useState<UserAccount | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [invitation, setInvitation] = useState<{ email: string; details: OnboardingInvitation } | null>(null);
  const { toast: notify } = useToast();
  const showToast = (message: string) => notify(message, 'success');
  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  };
  const setRoleFilter = (value: 'all' | UserRole) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value === 'all') next.delete('role');
    else next.set('role', value);
    setSearchParams(next, { replace: true });
  };
  const setStatusFilter = (value: 'all' | UserStatus) => {
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [accounts, lookups] = await Promise.all([fetchUsers(), fetchUserOptions()]);
      setUsers(accounts);
      setOptions(lookups);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'User Management could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useBackgroundRefresh(async () => {
    const accounts = await fetchUsers();
    setUsers(accounts);
    setLoadError('');
  }, 'standard');

  useEffect(() => {
    if (!targetId || loading) return;
    const target = users.find((account) => account.id === targetId);
    if (target) setSelected(target);
  }, [loading, targetId, users]);

  const closeSelected = () => {
    setSelected(null);
    if (!targetId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('target');
    setSearchParams(next, { replace: true });
  };

  const handleCreate = async (input: CreateUserInput) => {
    const result = await createUser(input);
    setUsers((current) => [result.user, ...current]);
    setInvitation({ email: result.user.email, details: result.invitation });
    showToast(`Verification instructions issued to ${result.user.email}`);
  };

  // Lifecycle actions now ask for confirmation first
  const handleToggleStatus = (id: string) => {
    if (id === currentUser?.id) {
      notify('Your own administrator account cannot be deactivated here.', 'error');
      return;
    }
    const user = users.find((u) => u.id === id);
    if (!user) return;
    setConfirm({ kind: ['inactive', 'suspended', 'locked'].includes(user.status) ? 'reactivate' : 'deactivate', user });
  };

  const handleSuspend = (id: string) => {
    if (id === currentUser?.id) {
      notify('Your own administrator account cannot be suspended here.', 'error');
      return;
    }
    const user = users.find((account) => account.id === id);
    if (user) setConfirm({ kind: 'suspend', user });
  };

  const handleResetPassword = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user) setConfirm({ kind: 'reset', user });
  };

  const handleDelete = (id: string) => {
    const account = users.find((item) => item.id === id);
    if (account?.canDelete) setConfirm({ kind: 'delete', user: account });
  };

  const runConfirmed = async (password?: string) => {
    if (!confirm) return;
    const { kind, user } = confirm;
    if (kind === 'delete') {
      await deleteUserAccount(user.id, password ?? '');
      setUsers((current) => current.filter((account) => account.id !== user.id));
      if (selected?.id === user.id) closeSelected();
      showToast(`Unused account for ${user.firstName} ${user.lastName} permanently removed.`);
    } else if (kind === 'reset') {
      const details = await issuePasswordReset(user.id);
      setInvitation({ email: user.email, details });
      showToast(`${details.kind === 'onboarding' ? 'Activation' : 'Password reset'} instructions issued to ${user.email}`);
    } else {
      const next = kind === 'deactivate' ? 'inactive' : kind === 'suspend' ? 'suspended' : 'active';
      const updated = await changeUserStatus(user.id, next, password);
      setUsers((current) => current.map((account) => (account.id === updated.id ? updated : account)));
      setSelected((current) => current?.id === updated.id ? updated : current);
      showToast(
        next === 'inactive'
          ? `Account for ${user.firstName} ${user.lastName} deactivated.`
          : next === 'suspended'
            ? `Account for ${user.firstName} ${user.lastName} suspended and all sessions revoked.`
          : `Account for ${user.firstName} ${user.lastName} reactivated.`
      );
    }
    setConfirm(null);
  };

  // Deactivating a top-level account requires the password again (step-up)
  const needsStepUp =
    !!confirm && (confirm.kind === 'delete' || (['deactivate', 'suspend'].includes(confirm.kind) && (confirm.user.role === 'DEAN' || confirm.user.role === 'REGISTRAR')));

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch = `${u.title} ${u.firstName} ${u.lastName} ${u.email} ${u.role} ${u.unit}`.toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <KyPageHeader
        title="User Management"
        subtitle="Create, govern and oversee accounts across the whole delegation chain"
        actions={
          <KyButton variant="accent" icon={<UserPlus size={16} />} onClick={() => setShowCreate(true)} disabled={!options || loading}>
            Create Account
          </KyButton>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-red-700">{loadError}</p>
          <KyButton variant="outline" size="sm" onClick={() => void load()}>Try Again</KyButton>
        </div>
      )}

      {invitation && (
        <div className="rounded-xl border border-kyu-blue/20 bg-blue-50 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-kyu-blue flex items-center gap-2"><KeyRound size={16} /> {invitation.details.kind === 'onboarding' ? 'Activation' : 'Password reset'} details for {invitation.email}</p>
            <p className="text-xs text-gray-600 mt-1">
              {invitation.details.kind === 'onboarding' ? 'The activation code expires in 15 minutes.' : 'A single-use password reset link has been emailed and expires in 30 minutes.'}
              {invitation.details.developmentOtp && <> Development code: <span className="font-mono font-bold text-base text-kyu-blue">{invitation.details.developmentOtp}</span></>}
            </p>
          </div>
          <div className="flex gap-2">
            {invitation.details.url && <a href={invitation.details.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-kyu-blue text-white text-sm font-semibold">
              {invitation.details.kind === 'onboarding' ? 'Open Activation' : 'Open Reset Page'} <ExternalLink size={14} />
            </a>}
            <button onClick={() => setInvitation(null)} className="px-3 py-2 text-sm text-gray-500">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KyStatCard label="Total Accounts" value={users.length} hint="every delegation level" icon={Users} tone="text-kyu-blue bg-kyu-blue/10" />
        <KyStatCard label="Active" value={users.filter((u) => u.status === 'active').length} hint="can sign in now" icon={UserCheck} tone="text-green-600 bg-green-100" />
        <KyStatCard label="Pending Verification" value={users.filter((u) => u.status === 'pending').length} hint="awaiting OTP onboarding" icon={Hourglass} tone="text-kyu-orange-dark bg-kyu-orange/20" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, role or unit..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm"
          />
        </div>
        <div className="w-full md:w-60">
          <KySelect label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}>
            <option value="all">All roles</option>
            {(Object.keys(roleLabels) as UserRole[]).map((r) => (
              <option key={r} value={r}>{roleLabels[r]}</option>
            ))}
          </KySelect>
        </div>
        <div className="w-full md:w-48">
          <KySelect label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | UserStatus)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="locked">Locked</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Deactivated</option>
          </KySelect>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">Loading accounts…</div>
      ) : !loadError ? (
        <UsersTable users={filtered} onToggleStatus={handleToggleStatus} onResetPassword={handleResetPassword} onSelect={setSelected} onDelete={handleDelete} />
      ) : null}

      {showCreate && options && <CreateAccountModal onClose={() => setShowCreate(false)} onCreate={handleCreate} options={options} />}

      <AccountDrawer
        user={selected}
        onClose={closeSelected}
        onReset={() => selected && handleResetPassword(selected.id)}
        onToggle={() => selected && handleToggleStatus(selected.id)}
        onSuspend={() => selected && handleSuspend(selected.id)}
        onDelete={() => selected && handleDelete(selected.id)}
        onAssign={() => setAssigning(true)}
      />

      {assigning && selected && options && <AddAssignmentsModal user={selected} options={options} onClose={() => setAssigning(false)} onSave={async (input) => {
        const updated = await addUserAssignments(selected.id, input);
        setUsers((current) => current.map((account) => account.id === updated.id ? updated : account));
        setSelected(updated);
        showToast('The additional assignments are now active.');
      }} />}

      {confirm && (
        <KyConfirm
          open
          title={
            confirm.kind === 'deactivate' ? 'Deactivate this account?' :
            confirm.kind === 'suspend' ? 'Suspend this account?' :
            confirm.kind === 'reactivate' ? 'Reactivate this account?' :
            confirm.kind === 'delete' ? 'Permanently remove this unused account?' :
            confirm.user.status === 'pending' ? 'Resend the activation code?' : 'Send a password reset link?'
          }
          message={
            confirm.kind === 'deactivate'
              ? `${confirm.user.title} ${confirm.user.firstName} ${confirm.user.lastName} will be blocked from logging in at every level. Their audit history is preserved.`
              : confirm.kind === 'suspend'
                ? `${confirm.user.title} ${confirm.user.firstName} ${confirm.user.lastName} will be temporarily blocked and all current sessions will be revoked.`
              : confirm.kind === 'reactivate'
                ? `${confirm.user.title} ${confirm.user.firstName} ${confirm.user.lastName} will regain access with their existing role and scope.`
                : confirm.kind === 'delete'
                  ? `${confirm.user.title} ${confirm.user.firstName} ${confirm.user.lastName} has never signed in. The account and its unused assignment will be permanently removed. This cannot be undone.`
                : confirm.user.status === 'pending'
                  ? `A new six-digit activation code will be emailed to ${confirm.user.email}. The previous code will stop working.`
                  : `A secure, single-use reset link will be emailed to ${confirm.user.email}. It expires in 30 minutes.`
          }
          tone={['deactivate', 'suspend', 'delete'].includes(confirm.kind) ? 'danger' : 'primary'}
          stepUp={needsStepUp}
          confirmLabel={confirm.kind === 'deactivate' ? 'Deactivate' : confirm.kind === 'suspend' ? 'Suspend' : confirm.kind === 'reactivate' ? 'Reactivate' : confirm.kind === 'delete' ? 'Remove Permanently' : confirm.user.status === 'pending' ? 'Resend Code' : 'Send Link'}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
