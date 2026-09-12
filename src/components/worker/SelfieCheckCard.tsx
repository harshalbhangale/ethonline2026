"use client";

import type { IDKitResult, RpContext } from "@worldcoin/idkit-core";
import { usePrivy } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
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
    },
    [getAccessToken],
  );

  if (!state?.enabled) return null;

  const verified = state.status === "VERIFIED";
  const expires = formatDate(state.expiresAt);

  return (
    <div className="border-t border-[var(--line)] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--faint)]">
        Identity check
      </p>

      {verified ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--faint)]">
          Verified with World Selfie Check{expires ? `, valid until ${expires}` : ""}.
        </p>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--faint)]">
          A quick selfie confirms a real person is behind this account. Required
          before you can take jobs.
        </p>
      )}

      {!verified && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="mt-3 h-10 rounded-xl bg-[var(--solid)] px-5 text-[13.5px] font-semibold text-[var(--solid-ink)] disabled:opacity-40"
        >
          {busy ? "Starting…" : "Verify with World ID"}
        </button>
      )}

      {error && <p className="mt-3 text-[12.5px] text-[var(--bad)]">{error}</p>}

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
