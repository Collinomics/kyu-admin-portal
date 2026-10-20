import type { UserStatus } from '../types';

const styles: Record<UserStatus, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-kyu-orange/20 text-kyu-orange-dark',
  locked: 'bg-red-100 text-red-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  inactive: 'bg-gray-200 text-gray-600',
};

const labels: Record<UserStatus, string> = {
  active: 'Active',
  pending: 'Pending Verification',
  locked: 'Locked',
  suspended: 'Suspended',
  inactive: 'Deactivated',
};

export default function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}