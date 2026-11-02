"use client";

import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(target: number, duration = 720): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const diff = target - from;
    if (Math.abs(diff) < 0.0001) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + diff * eased;
      setDisplay(value);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = display;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format, className = "" }: AnimatedNumberProps) {
  const animated = useAnimatedNumber(value);
  return <span className={className}>{format(animated)}</span>;
}
