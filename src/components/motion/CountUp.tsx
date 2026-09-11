"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A number that counts to its value when it first scrolls into view, and
 * glides between values after that. Writes straight to the DOM so a poll
 * updating it every few seconds never re-renders the component.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  // Held in a ref: an inline formatter is a new function every render, and
  // must not restart the count each time.
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;

    if (reduce) {
      node.textContent = formatRef.current(value);
      shown.current = value;
      return;
    }

    const controls = animate(shown.current, value, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (latest) => {
        shown.current = latest;
        node.textContent = formatRef.current(latest);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
