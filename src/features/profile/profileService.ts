import { apiFetch } from '../../services/api';

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = Object.values(body.errors ?? {}).flat()[0];
    throw new Error(String(first ?? body.message ?? 'The request could not be completed.'));
  }
  return body;
}

export async function updatePersonalProfile(input: { title: string; firstName: string; lastName: string; photo?: File }) {
  const form = new FormData();
  form.set('title', input.title);
  form.set('first_name', input.firstName);
  form.set('last_name', input.lastName);
  if (input.photo) form.set('photo', input.photo);
  return request('/api/v1/auth/profile', { method: 'POST', body: form });
}

export async function updatePersonalPassword(currentPassword: string, password: string, passwordConfirmation: string) {
  return request('/api/v1/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, password, password_confirmation: passwordConfirmation }),
  });
}

export async function removePersonalPhoto() {
  return request('/api/v1/auth/profile-photo', { method: 'DELETE' });
}
