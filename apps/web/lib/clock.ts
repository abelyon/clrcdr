import { API_URL } from './config';

let offsetMs = 0;
let synced: Promise<void> | null = null;

/** Estimated server time (ms). Falls back to the local clock until `syncClock` completes. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function setClockOffset(value: number): void {
  offsetMs = value;
}

export function getClockOffset(): number {
  return offsetMs;
}

/** Midpoint estimate of the offset between server and local clock using `/health`'s `time`. */
export function computeOffset(serverTimeMs: number, requestedAt: number, receivedAt: number): number {
  return serverTimeMs - (requestedAt + receivedAt) / 2;
}

export function syncClock(force = false): Promise<void> {
  if (synced && !force) return synced;
  synced = (async () => {
    try {
      const t0 = Date.now();
      const response = await fetch(`${API_URL}/health`, { cache: 'no-store' });
      const t1 = Date.now();
      const data = (await response.json()) as { time?: string };
      const serverTime = data.time ? Date.parse(data.time) : NaN;
      if (Number.isFinite(serverTime)) offsetMs = computeOffset(serverTime, t0, t1);
    } catch {
      offsetMs = 0;
    }
  })();
  return synced;
}
