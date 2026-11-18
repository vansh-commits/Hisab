import { useEffect, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// useCountUp eases a number from 0 to `to` (integers, e.g. paise) for dashboard figures.
export function useCountUp(to: number, ms = 700): number {
  const [v, setV] = useState(() => (reduced() ? to : 0));
  useEffect(() => {
    if (reduced() || to === 0) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}
