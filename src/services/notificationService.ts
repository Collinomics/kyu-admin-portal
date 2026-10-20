import { apiFetch } from './api';

export type NotificationType = 'review' | 'warning' | 'deadline' | 'security';

export interface PortalNotification {
  id: string;
  type: NotificationType;
  text: string;
  occurred_at: string;
  path: string;
}

export async function fetchNotifications(signal?: AbortSignal): Promise<PortalNotification[]> {
  const response = await apiFetch('/api/v1/notifications', { signal, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Notifications could not be loaded.');

  return body.data as PortalNotification[];
}
