// Shared animation hooks — used by Home, Nutrition, Activity, and any future
// screens that need count-up number animations.

import { useEffect, useState } from 'react';

// Module-level cache of which (cacheKey, lastTarget) pairs have already been
// animated during this app session. Lives as long as the JS runtime does —
// survives navigation / modal open-close cycles, resets on full reload.
const animatedCache = new Map<string, number>();

/**
 * Count-up hook — animates a number from 0 to `target` over `duration` ms
 * with ease-out-cubic. Supports an optional start `delay`.
 *
 * If a `cacheKey` is provided, the hook only animates the **first** time it
 * sees a given (cacheKey, target) pair in this app session. Subsequent
 * mounts with the same target snap straight to the value — so animations
 * don't replay every time a parent re-renders or a modal closes.
 *
 * A new target for the same cacheKey will animate again (e.g. pull-to-refresh
 * fetches new data → count-up plays again).
 */
export function useCountUp(
  target: number,
  duration = 900,
  delay = 0,
  cacheKey?: string,
): number {
  const alreadyShown =
    cacheKey != null && animatedCache.get(cacheKey) === target;

  const [val, setVal] = useState<number>(alreadyShown ? target : 0);

  useEffect(() => {
    if (alreadyShown) {
      setVal(target);
      return;
    }
    if (cacheKey != null) animatedCache.set(cacheKey, target);

    let raf: number;
    const t0 = performance.now() + delay;
    let start = 0;
    const run = (ts: number) => {
      if (ts < t0) { raf = requestAnimationFrame(run); return; }
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, cacheKey, alreadyShown]);

  return val;
}
