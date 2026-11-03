import { useEffect, useRef } from "react";

/**
 * Calls `tick` every `intervalMs` while `active` is true, and stops by itself
 * after `maxTicks` calls so a job that never finishes cannot poll forever.
 */
export function usePolling(active: boolean, tick: () => unknown, intervalMs = 3000, maxTicks = 100) {
  const latest = useRef(tick);

  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    if (!active) return;
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      if (count > maxTicks) {
        window.clearInterval(id);
        return;
      }
      void latest.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, maxTicks]);
}
