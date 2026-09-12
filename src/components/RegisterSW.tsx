"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In dev the shell cache serves stale bundles against freshly rendered
    // HTML, which shows up as a hydration mismatch. Unregister instead.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
