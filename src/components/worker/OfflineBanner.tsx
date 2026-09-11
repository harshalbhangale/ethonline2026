"use client";

import { useEffect, useState } from "react";

/** Tells a worker the app cannot reach the server before they try to submit. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();

    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <p className="bg-[var(--amber-soft)] px-5 py-2 text-center text-[12px] font-medium text-[var(--amber)]">
      Offline — jobs and payouts will refresh when you reconnect.
    </p>
  );
}
