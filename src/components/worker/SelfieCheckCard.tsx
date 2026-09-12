"use client";

import type { IDKitResult, RpContext } from "@worldcoin/idkit-core";
import { usePrivy } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useWorker } from "@/components/worker/WorkerStore";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";

const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitRequestWidget),
  { ssr: false },
);

type SelfieCheckState = {
  enabled: boolean;
  status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "FAILED";
  verifiedAt: string | null;
  expiresAt: string | null;
};

type RequestContext = {
  appId: string;
  action: string;
  environment: "production" | "staging" | "sandbox";
  rpContext: RpContext;
};

function ShieldMark({ verified, busy }: { verified: boolean; busy: boolean }) {
  return (
    <div
      className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border transition-colors ${
        verified
          ? "border-[color-mix(in_srgb,var(--good)_40%,transparent)] bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-[var(--good)]"
          : "border-[var(--line)] bg-[var(--raised)] text-[var(--muted)]"
      }`}
    >
      {busy && (
        <span className="absolute inset-0 animate-[sheen_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--ink)_10%,transparent)] to-transparent" />
      )}
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M12 3.2 5.4 6v5.3c0 4 2.8 7.7 6.6 8.6 3.8-.9 6.6-4.6 6.6-8.6V6L12 3.2Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {verified ? (
          <path
            d="m9.2 12.1 2 2 3.6-3.9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx="12" cy="11.6" r="2.1" stroke="currentColor" strokeWidth="1.6" />
        )}
      </svg>
    </div>
  );
}

function StatusPill({ verified, expiringSoon }: { verified: boolean; expiringSoon: boolean }) {
  const tone = !verified
    ? { label: "Required", color: "var(--muted)" }
    : expiringSoon
      ? { label: "Expiring soon", color: "var(--amber)" }
      : { label: "Verified", color: "var(--good)" };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
      style={{
        color: tone.color,
        backgroundColor: `color-mix(in srgb, ${tone.color} 13%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.color }} />
      {tone.label}
    </span>
  );
}

function CheckDot() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="m5.5 8.2 1.7 1.7 3.3-3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 animate-spin">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.8" opacity="0.25" />
      <path d="M8 1.8A6.2 6.2 0 0 1 14.2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WorldMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.7 8h12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8 1.7c1.7 1.8 2.6 4 2.6 6.3S9.7 12.5 8 14.3C6.3 12.5 5.4 10.3 5.4 8S6.3 3.5 8 1.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Whole days from now until `value`, or null when there is no expiry. */
function daysUntil(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * World Selfie Check: proves a live human is behind the worker account before
 * they can take paid jobs. Renders nothing until the feature is switched on.
 */
export function SelfieCheckCard() {
  const { getAccessToken } = usePrivy();
  const { refresh } = useWorker();
  const [state, setState] = useState<SelfieCheckState | null>(null);
  const [context, setContext] = useState<RequestContext | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch<SelfieCheckState>(getAccessToken, "/api/worker/selfie-check")
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  // The signed context is short-lived, so it is fetched when the worker starts.
  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await authenticatedFetch<RequestContext>(
        getAccessToken,
        "/api/worker/selfie-check/context",
      );
      setContext(data);
      setOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the check.");
    } finally {
      setBusy(false);
    }
  }, [getAccessToken]);

  // Runs before success is emitted: the server is the only thing that decides.
  const handleVerify = useCallback(
    async (result: IDKitResult) => {
      const next = await authenticatedFetch<SelfieCheckState>(
        getAccessToken,
        "/api/worker/selfie-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        },
      );
      setState(next);
      if (next.status === "VERIFIED") await refresh();
    },
    [getAccessToken, refresh],
  );

  if (!state?.enabled) return null;

  const verified = state.status === "VERIFIED";
  const expires = formatDate(state.expiresAt);
  const daysLeft = daysUntil(state.expiresAt);
  // Below two weeks the credential is worth renewing before it lapses mid-job.
  const expiringSoon = verified && daysLeft !== null && daysLeft <= 14;

  return (
    <div className="animate-[rise_0.4s_ease-out] border-t border-[var(--line)] p-5">
      <div className="flex items-start gap-3.5">
        <ShieldMark verified={verified} busy={busy} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--faint)]">
              Identity check
            </p>
            <StatusPill verified={verified} expiringSoon={expiringSoon} />
          </div>

          {verified ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              You&rsquo;re verified as a real person.
              {expires ? (
                <>
                  {" "}
                  <span className={expiringSoon ? "text-[var(--amber)]" : "text-[var(--faint)]"}>
                    {expiringSoon && daysLeft !== null
                      ? `Renew in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.`
                      : `Valid until ${expires}.`}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              A quick selfie proves a real person is behind this account. It takes
              about a minute, and it&rsquo;s required before you can take jobs.
            </p>
          )}

          {!verified && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {[
                "Your face is never sent to StickerBomb",
                "One account per person",
                "Valid for 90 days",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-center gap-2 text-[12px] text-[var(--faint)]"
                >
                  <CheckDot />
                  {line}
                </li>
              ))}
            </ul>
          )}

          {(!verified || expiringSoon) && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="mt-3.5 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--solid)] px-4 text-[13.5px] font-semibold text-[var(--solid-ink)] transition-opacity active:opacity-80 disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Spinner />
                  Opening World App…
                </>
              ) : (
                <>
                  <WorldMark />
                  {verified ? "Renew verification" : "Verify with World ID"}
                </>
              )}
            </button>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--raised)] px-3 py-2.5">
              <p className="flex-1 text-[12.5px] leading-relaxed text-[var(--bad)]">{error}</p>
              <button
                type="button"
                onClick={() => void start()}
                className="shrink-0 text-[12.5px] font-semibold text-[var(--amber)]"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {context && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={context.appId as `app_${string}`}
          action={context.action}
          rp_context={context.rpContext}
          environment={context.environment}
          allow_legacy_proofs
          preset={{ type: "SelfieCheckLegacy" }}
          handleVerify={handleVerify}
          onSuccess={() => setOpen(false)}
          onError={(code) => {
            if (code === "user_rejected") return;
            setError(
              code === "failed_by_host_app"
                ? "That check could not be saved. Try again."
                : "The check did not finish. Try again.",
            );
          }}
        />
      )}
    </div>
  );
}
