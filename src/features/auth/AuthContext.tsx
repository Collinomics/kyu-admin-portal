import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '../users/types';
import { apiFetch, AUTH_SESSION_ENDED_EVENT, clearAccessToken, getAccessToken, setAccessToken } from '../../services/api';
import { AuthRequestError } from './authErrors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  mustChangePassword: boolean;
  title: string;
  firstName: string;
  lastName: string;
  hasProfilePhoto: boolean;
  profileUpdatedAt: string;
  faculty: string;
  department: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reauthenticate: (password: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id),
    name: String(raw.name),
    email: String(raw.email),
    role: raw.role as UserRole,
    status: String(raw.status),
    mustChangePassword: Boolean(raw.must_change_password),
    title: String(raw.title ?? ''),
    firstName: String(raw.first_name ?? ''),
    lastName: String(raw.last_name ?? ''),
    hasProfilePhoto: Boolean(raw.has_profile_photo),
    profileUpdatedAt: String(raw.profile_updated_at ?? ''),
    faculty: String(raw.faculty ?? ''),
    department: String(raw.department ?? ''),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const response = await apiFetch('/api/v1/auth/me');
    if (!response.ok) throw new Error('Session unavailable');
    const body = await response.json();
    setUser(mapUser(body.data));
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    refreshUser()
      .catch(() => clearAccessToken())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const endSession = () => setUser(null);
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, endSession);
    return () => window.removeEventListener(AUTH_SESSION_ENDED_EVENT, endSession);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, device_name: 'admin-portal' }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.message
        ?? body.errors?.email?.[0]
        ?? 'Sign in failed. Check your email and password.';
      throw new AuthRequestError(message, String(body.code ?? ''), Number(body.retry_after ?? 0));
    }
    setAccessToken(String(body.data.token));
    setUser(mapUser(body.data.user));
  };

  const logout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearAccessToken();
      setUser(null);
    }
  };

  const reauthenticate = async (password: string) => {
    const response = await apiFetch('/api/v1/auth/reauthenticate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    return response.ok;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reauthenticate, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
