import { createContext, createElement, useContext, useEffect, useRef, type ReactNode } from 'react';

export interface BackgroundRefreshPolicy {
  enabled: boolean;
  operationalSeconds: number;
  standardSeconds: number;
}

const DEFAULT_POLICY: BackgroundRefreshPolicy = {
  enabled: true,
  operationalSeconds: 10,
  standardSeconds: 15,
};

const BackgroundRefreshContext = createContext(DEFAULT_POLICY);

export function BackgroundRefreshProvider({ policy, children }: { policy: BackgroundRefreshPolicy; children: ReactNode }) {
  return createElement(BackgroundRefreshContext.Provider, { value: policy }, children);
}

type Cadence = 'operational' | 'standard' | { seconds: number; enabled?: boolean };

export function useBackgroundRefresh(refresh: () => Promise<unknown>, cadence: Cadence = 'standard') {
  const policy = useContext(BackgroundRefreshContext);
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const failuresRef = useRef(0);
  refreshRef.current = refresh;

  const enabled = typeof cadence === 'object' ? (cadence.enabled ?? true) : policy.enabled;
  const seconds = typeof cadence === 'object'
    ? cadence.seconds
    : cadence === 'operational' ? policy.operationalSeconds : policy.standardSeconds;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;

    const schedule = () => {
      if (stopped) return;
      const backoff = Math.min(8, 2 ** failuresRef.current);
      const jitter = 0.9 + Math.random() * 0.2;
      timer = window.setTimeout(run, Math.max(3, seconds) * 1000 * backoff * jitter);
    };
    const run = async () => {
      if (stopped) return;
      if (document.hidden || !navigator.onLine || inFlightRef.current) {
        schedule();
        return;
      }
      inFlightRef.current = true;
      try {
        await refreshRef.current();
        failuresRef.current = 0;
      } catch {
        failuresRef.current = Math.min(failuresRef.current + 1, 3);
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    };
    const resume = () => {
      if (document.hidden || !navigator.onLine) return;
      if (timer !== undefined) window.clearTimeout(timer);
      failuresRef.current = 0;
      void run();
    };
    const refreshNow = () => { void run(); };

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('kyu:background-refresh-now', refreshNow);
    schedule();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('kyu:background-refresh-now', refreshNow);
    };
  }, [enabled, seconds]);
}
