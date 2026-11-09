'use client';

import * as React from 'react';

/** Milliseconds elapsed since `startedAt`, ticking while `running`. Freezes at `frozenMs` when provided. */
export function useElapsed(
  startedAt: number | null,
  running: boolean,
  now: () => number = Date.now,
  frozenMs?: number | null,
): number {
  const [elapsed, setElapsed] = React.useState(0);
  const nowRef = React.useRef(now);
  nowRef.current = now;

  React.useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, nowRef.current() - startedAt));
    tick();
    if (!running) return;
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, running]);

  if (!running && frozenMs != null) return frozenMs;
  return elapsed;
}
