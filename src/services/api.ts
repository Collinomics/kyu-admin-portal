const TOKEN_KEY = 'kyu-pcs-access-token';
const AUTH_NOTICE_KEY = 'kyu-pcs-auth-notice';
export const AUTH_SESSION_ENDED_EVENT = 'kyu:auth-session-ended';
const prefetchedResponses = new Map<string, { response: Response; expiresAt: number }>();
const prefetchRequests = new Map<string, Promise<void>>();
let prefetchEpoch = 0;
const DEFAULT_CACHE_AGE_MS = 5 * 60_000;

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  prefetchedResponses.clear();
  prefetchRequests.clear();
  prefetchEpoch += 1;
}

export function consumeAuthNotice(): string {
  const notice = sessionStorage.getItem(AUTH_NOTICE_KEY) ?? '';
  sessionStorage.removeItem(AUTH_NOTICE_KEY);
  return notice;
}

function requestKey(path: string): string {
  return `${getAccessToken() ?? 'public'}:${path}`;
}

async function networkFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (token && response.status === 401) {
      clearAccessToken();
      sessionStorage.setItem(AUTH_NOTICE_KEY, 'Your session has expired. Please sign in again.');
      window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT));
    } else if (token && response.status === 403) {
      const body = await response.clone().json().catch(() => ({}));
      if (body.code === 'ACCOUNT_UNAVAILABLE') {
        clearAccessToken();
        sessionStorage.setItem(AUTH_NOTICE_KEY, String(body.message ?? 'Your session is no longer available.'));
        window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT));
      }
    }
    if (response.status >= 500) {
      return new Response(JSON.stringify({ message: 'The service is temporarily unavailable. Please try again.' }), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('The server took too long to respond. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' && init.cache !== 'no-store';
  if (cacheable && init.cache !== 'reload') {
    const key = requestKey(path);
    const pending = prefetchRequests.get(key);
    if (pending) await pending;
    if (init.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const cached = prefetchedResponses.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        void prefetchApi(path, DEFAULT_CACHE_AGE_MS, true);
        return cached.response.clone();
      }
      prefetchedResponses.delete(key);
    }
  }
  const response = await networkFetch(path, init);
  if (cacheable && response.ok) {
    prefetchedResponses.set(requestKey(path), { response: response.clone(), expiresAt: Date.now() + DEFAULT_CACHE_AGE_MS });
  } else if (method !== 'GET' && response.ok) {
    prefetchEpoch += 1;
    prefetchedResponses.clear();
    prefetchRequests.clear();
  }
  return response;
}

export function prefetchApi(path: string, maxAgeMs = DEFAULT_CACHE_AGE_MS, revalidate = false): Promise<void> {
  const key = requestKey(path);
  const cached = prefetchedResponses.get(key);
  if (!revalidate && cached?.expiresAt && cached.expiresAt > Date.now()) return Promise.resolve();
  const existing = prefetchRequests.get(key);
  if (existing) return existing;
  const epoch = prefetchEpoch;

  const request = networkFetch(path)
    .then((response) => {
      if (response.ok && epoch === prefetchEpoch) prefetchedResponses.set(key, { response: response.clone(), expiresAt: Date.now() + maxAgeMs });
    })
    .catch(() => undefined)
    .finally(() => prefetchRequests.delete(key));
  prefetchRequests.set(key, request);
  return request;
}
