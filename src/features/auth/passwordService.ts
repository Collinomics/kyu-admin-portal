import { apiFetch } from '../../services/api';

interface ForgotPasswordResponse {
  message: string;
  development_url?: string;
}

async function request(path: string, body: Record<string, string>) {
  const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(payload.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? payload.message ?? 'The request could not be completed.'));
  }
  return payload.data;
}

export async function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  return request('/api/v1/auth/password/forgot', { email });
}

export async function resetPassword(email: string, token: string, password: string): Promise<void> {
  await request('/api/v1/auth/password/reset', {
    email,
    token,
    password,
    password_confirmation: password,
  });
}
