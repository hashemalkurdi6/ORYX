// Shared animation hooks — used by Home, Nutrition, and any future screens
// that need count-up number animations or staggered entrance.

import { useEffect, useState } from 'react';

/**
 * Count-up hook — animates a number from 0 to `target` over `duration` ms
 * with ease-out-cubic. Supports an optional start `delay`. Resets when
 * `target` changes.
 */
export function useCountUp(target: number, duration = 900, delay = 0): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
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
  }, [target, duration, delay]);
  return val;
}
