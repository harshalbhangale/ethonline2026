"use client";

import { useEffect, useRef, useState } from "react";
import { useWorker } from "@/components/worker/WorkerStore";
import { ClientApiError } from "@/lib/api/authenticated-fetch";
import type { WorkerPingDto } from "@/lib/jobs/types";

/** The server drops pings closer together than 3s, so stay just outside that. */
const PING_INTERVAL_MS = 4_000;

export type Fix = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type LivePresence = {
  /** Latest device position, whether or not the ping round-trip succeeded. */
  fix: Fix | null;
  /** Latest server answer: distance, dwell and whether proof can unlock. */
  reading: WorkerPingDto | null;
  /** Set when the browser refused or failed to give a position. */
  locationError: string | null;
  /** Set when the ping round-trip itself failed. */
  pingError: string | null;
  /** True until the first position arrives. */
  acquiring: boolean;
};

function geolocationMessage(code: number) {
  if (code === 1) {
    return "Location is blocked. Turn it on for this site so your arrival can be confirmed.";
  }
  if (code === 2) return "Your location is unavailable right now.";
  return "Getting your location is taking longer than usual.";
}

/**
 * Streams the worker's position to the ping endpoint while they hold a job,
 * and reports back how close they are and whether they have been on site
 * long enough to submit proof.
 */
export function useLivePresence(jobId: string, active: boolean): LivePresence {
  const { ping } = useWorker();
  const [fix, setFix] = useState<Fix | null>(null);
  const [reading, setReading] = useState<WorkerPingDto | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [acquiring, setAcquiring] = useState(false);

  // Refs so the watcher below never needs to be torn down and re-created.
  const lastSentAt = useRef(0);
  const inFlight = useRef(false);
  // Held in a ref because a new `ping` identity must not restart the watcher.
  const pingRef = useRef(ping);
  useEffect(() => {
    pingRef.current = ping;
  }, [ping]);

  useEffect(() => {
    if (!active) return;

    if (!navigator.geolocation) {
      setLocationError("This device cannot share its location.");
      return;
    }

    let cancelled = false;
    setAcquiring(true);
    setLocationError(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return;

        const next: Fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : undefined,
        };
        setFix(next);
        setAcquiring(false);
        setLocationError(null);

        // Throttle: the watcher can fire far faster than we want to post.
        const now = Date.now();
        if (inFlight.current || now - lastSentAt.current < PING_INTERVAL_MS) {
          return;
        }
        lastSentAt.current = now;
        inFlight.current = true;

        void pingRef
          .current(jobId, next)
          .then((result) => {
            if (cancelled) return;
            setReading(result);
            setPingError(null);
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            setPingError(
              error instanceof ClientApiError
                ? error.message
                : "Could not share your location just now.",
            );
          })
          .finally(() => {
            inFlight.current = false;
          });
      },
      (error) => {
        if (cancelled) return;
        setAcquiring(false);
        setLocationError(geolocationMessage(error.code));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2_000 },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active, jobId]);

  return { fix, reading, locationError, pingError, acquiring };
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/** The worker-facing readout of arrival and dwell progress. */
export default function LivePresencePanel({
  presence,
  radiusMeters,
  minDwellSeconds,
}: {
  presence: LivePresence;
  radiusMeters: number;
  minDwellSeconds: number;
}) {
  const { reading, locationError, pingError, acquiring } = presence;

  if (locationError) {
    return (
      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-[14px] font-semibold">Location needed</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
          {locationError}
        </p>
      </div>
    );
  }

  if (acquiring || !reading) {
    return (
      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-[14px] font-semibold">Finding you</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
          Keep this screen open. Proof unlocks once you have been within{" "}
          {radiusMeters} m of the spot for {minDwellSeconds} seconds.
        </p>
      </div>
    );
  }

  const dwellProgress = Math.min(
    100,
    Math.round((reading.secondsOnSite / Math.max(1, reading.minDwellSeconds)) * 100),
  );

  return (
    <div
      className={`mt-5 rounded-2xl border p-4 ${
        reading.readyToVerify
          ? "border-[var(--good)] bg-[var(--surface)]"
          : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-semibold">
          {reading.readyToVerify
            ? "You are on site"
            : reading.insideFence
              ? "At the spot, hold on"
              : "Head to the spot"}
        </p>
        <span
          className={`shrink-0 text-[13px] font-medium ${
            reading.insideFence ? "text-[var(--good)]" : "text-[var(--muted)]"
          }`}
        >
          {formatDistance(reading.distanceMetres)} away
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--raised)]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            reading.readyToVerify ? "bg-[var(--good)]" : "bg-[var(--amber)]"
          }`}
          style={{ width: `${dwellProgress}%` }}
        />
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {reading.readyToVerify
          ? "Scan the poster's QR code and send your photo."
          : reading.insideFence
            ? `On site ${reading.secondsOnSite}s of ${reading.minDwellSeconds}s.`
            : `Get within ${reading.radiusMeters} m to start the ${reading.minDwellSeconds}s timer.`}
      </p>

      {pingError && (
        <p className="mt-2 text-[13px] text-[var(--amber)]">{pingError}</p>
      )}

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--faint)]">
        Your location trail is only read inside the confidential check. The brand
        never sees it.
      </p>
    </div>
  );
}
