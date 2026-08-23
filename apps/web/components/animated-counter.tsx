"use client";
import { useEffect, useRef } from "react";

export function AnimatedCounter({
  value,
  duration = 800,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    startRef.current = null;

    function tick(now: number) {
      if (!ref.current) return;
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      ref.current.textContent = String(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
      else { fromRef.current = to; }
    }
    requestAnimationFrame(tick);
  }, [value, duration]);

  return <span ref={ref} className={className}>{value}</span>;
}
