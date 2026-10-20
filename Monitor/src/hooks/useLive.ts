// Shared subscription to the live tail (users online, messages, endpoint
// latency, recent events). The mock engine is a singleton; the real backend
// will swap subscribeLive for SSE/WebSocket — components keep this hook.

import { useSyncExternalStore } from "react";
import { subscribeLive } from "../services/monitoringService";
import type { LiveSnapshot } from "../data/mockEngine";

const emptySnap: LiveSnapshot = {
  now: 0,
  usersOnline: 0,
  messagesToday: 0,
  tokensToday: 0,
  endpointLatency: {},
  recentEvents: [],
  apiOverall: "good",
  lastTick: 0,
};

let cached: LiveSnapshot = emptySnap;
const listeners = new Set<() => void>();
let stopLive: (() => void) | null = null;

function startLive() {
  if (stopLive) return;
  stopLive = subscribeLive((s) => {
    cached = s;
    for (const l of listeners) l();
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  startLive();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && stopLive) {
      stopLive();
      stopLive = null;
    }
  };
}

function getSnapshot(): LiveSnapshot {
  return cached;
}

export function useLive(): LiveSnapshot {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
}
