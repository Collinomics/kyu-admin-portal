import { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import type { AuthUser } from '../features/auth/AuthContext';

interface Props {
  user: AuthUser | null;
  className?: string;
}

export default function ProfileAvatar({ user, className = 'h-9 w-9' }: Props) {
  const [source, setSource] = useState('');
  const initials = user ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() : '?';

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    if (!user?.hasProfilePhoto) {
      setSource('');
      return;
    }
    apiFetch('/api/v1/auth/profile-photo')
      .then(async (response) => {
        if (!response.ok) throw new Error('Photo unavailable');
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setSource(objectUrl);
      })
      .catch(() => { if (!cancelled) setSource(''); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.hasProfilePhoto, user?.profileUpdatedAt]);

  return source ? (
    <img src={source} alt={`${user?.name ?? 'User'} profile`} className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-kyu-blue font-bold text-white`}>{initials}</span>
  );
}
