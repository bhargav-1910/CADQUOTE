import { useEffect, useRef, useState } from 'react';

/** Smoothly animates toward `value` (ease-out cubic) for count-up price changes. */
export const useAnimatedNumber = (value: number, duration = 450): number => {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value || !Number.isFinite(value)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, duration]);

  return display;
};
