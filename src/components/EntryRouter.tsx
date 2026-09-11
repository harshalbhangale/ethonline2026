"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import banner from "@/assets/banner.jpg";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { MeResponse } from "@/lib/auth/types";

type EntryStatus =
  | "signed-out"
  | "loading"
  | "needs-onboarding"
  | "onboarding"
  | "redirecting"
  | "error";

type EntryState = {
  scope: string | null;
  status: EntryStatus;
  error: string | null;
};

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="13.5" y="13.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function portalRoute(response: MeResponse) {
  if (response.role === "BRAND" || response.role === "OPERATOR") {
    return "/brand";
  }

  if (response.role === "WORKER") return "/worker";
  return null;
}

export default function EntryRouter() {
  const router = useRouter();
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [state, setState] = useState<EntryState>({
    scope: null,
    status: "loading",
    error: null,
  });

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const resolveMembership = useCallback(
    async (scope: string) => {
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setState({ scope, status: "loading", error: null });

      try {
        const response = await authenticatedFetch<MeResponse>(
          getAccessToken,
          "/api/me",
          { signal: controller.signal },
        );

        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return;
        }

        const route = portalRoute(response);
        if (route) {
          setState({ scope, status: "redirecting", error: null });
          router.replace(route);
          return;
        }

        setState({ scope, status: "needs-onboarding", error: null });
      } catch (caught) {
        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return;
        }

        setState({
          scope,
          status: "error",
          error:
            caught instanceof ClientApiError
              ? caught.message
              : "Could not resolve your workspace.",
        });
      } finally {
        if (sequence === requestSequence.current) {
          requestController.current = null;
        }
      }
    },
    [getAccessToken, router],
  );

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !userId) {
      cancelRequest();
      setState({ scope: null, status: "signed-out", error: null });
      return;
    }

    void resolveMembership(userId);

    return cancelRequest;
  }, [
    ready,
    authenticated,
    userId,
    resolveMembership,
    cancelRequest,
  ]);

  async function createBrandWorkspace() {
    if (!userId) return;

    const scope = userId;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setState({ scope, status: "onboarding", error: null });

    try {
      const response = await authenticatedFetch<MeResponse>(
        getAccessToken,
        "/api/onboarding/brand",
        { method: "POST", signal: controller.signal },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      const route = portalRoute(response);
      if (!route) throw new Error("Brand onboarding returned no workspace.");

      setState({ scope, status: "redirecting", error: null });
      router.replace(route);
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setState({
        scope,
        status: "error",
        error:
          caught instanceof ClientApiError
            ? caught.message
            : "Could not create your brand workspace.",
      });
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }

  const currentStatus =
    ready && authenticated && userId && state.scope === userId
      ? state.status
      : ready && !authenticated
        ? "signed-out"
        : "loading";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <Mark />
          <span className="text-[21px] font-extrabold tracking-[-0.03em]">StickerBomb</span>
        </div>

        <div className="panel rounded-[28px] border border-line px-6 py-12 text-center sm:px-10 sm:py-14">
          <span className="inline-flex rounded-full border border-badge/40 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">Brand portal</span>
          <h1 className="mx-auto mt-5 max-w-[16ch] text-[38px] font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-[46px]">Verified physical campaigns, from one sentence.</h1>
          <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-relaxed text-muted">Create a campaign, set its placement plan and keep the draft safely in your organization workspace.</p>

          {currentStatus === "error" ? (
            <p className="mx-auto mt-6 max-w-[48ch] text-[13.5px] text-fail">
              {state.error}
            </p>
          ) : null}

          {currentStatus === "needs-onboarding" ? (
            <p className="mx-auto mt-6 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
              Your Privy identity is ready. Create a brand workspace to manage campaigns.
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {currentStatus === "signed-out" ? (
              <button onClick={login} className="h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90">Sign in to the Brand Portal</button>
            ) : currentStatus === "needs-onboarding" ? (
              <button onClick={() => void createBrandWorkspace()} className="h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90">Create brand workspace</button>
            ) : currentStatus === "error" && userId ? (
              <button onClick={() => void resolveMembership(userId)} className="h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90">Try again</button>
            ) : (
              <span className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-[13.5px] font-semibold text-muted">
                {currentStatus === "onboarding"
                  ? "Creating your workspace…"
                  : currentStatus === "redirecting"
                    ? "Opening your workspace…"
                    : ready
                      ? "Checking your workspace…"
                      : "Loading authentication…"}
              </span>
            )}
            <Link href="/worker" className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-[14px] font-semibold hover:bg-raised">Worker Portal</Link>
          </div>
        </div>
      </div>
      </div>

      {/* Hero visual. Hidden on small screens so the sign-in card owns the viewport. */}
      <div className="relative hidden lg:block">
        <Image
          src={banner}
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>
    </main>
  );
}
