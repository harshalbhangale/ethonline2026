"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { MeResponse } from "@/lib/auth/types";

type GateState = {
  scope: string | null;
  status: "checking" | "authorized" | "redirecting" | "error";
  error: string | null;
};

type CachedAccess = { userId: string; at: number };

/**
 * The last successful access check is remembered so the portal renders
 * immediately on the next load while Privy starts and the check re-runs in the
 * background. This is only about speed: every API call is still authorized on
 * the server, so a stale cache can show the shell but never any data.
 */
const ACCESS_CACHE_KEY = "sb-brand-access";
const ACCESS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function readCachedAccess(): CachedAccess | null {
  try {
    const raw = localStorage.getItem(ACCESS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedAccess;
    return Date.now() - cached.at < ACCESS_CACHE_TTL_MS ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedAccess(userId: string | null) {
  try {
    if (userId) {
      localStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ userId, at: Date.now() }));
    } else {
      localStorage.removeItem(ACCESS_CACHE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the gate still works.
  }
}

/** Looks like the portal, so the wait feels like loading rather than a wall. */
function PortalSkeleton() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading your workspace">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line px-4 py-6 lg:block">
        <div className="mb-9 h-6 w-32 animate-pulse rounded-lg bg-raised" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-2xl bg-raised/70" />
          ))}
        </div>
      </aside>
      <div className="lg:pl-[248px]">
        <div className="h-[65px] border-b border-line" />
        <main className="mx-auto w-full max-w-[1120px] space-y-5 px-5 py-10 sm:px-8 sm:py-12">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-raised" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-[20px] bg-raised" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-[20px] bg-raised" />
        </main>
      </div>
    </div>
  );
}

export default function BrandAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [cached, setCached] = useState<CachedAccess | null>(null);
  const [state, setState] = useState<GateState>({
    scope: null,
    status: "checking",
    error: null,
  });

  // Read after mount so server and client render the same first frame.
  useEffect(() => {
    setCached(readCachedAccess());
  }, []);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const checkAccess = useCallback(
    async (scope: string) => {
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setState({ scope, status: "checking", error: null });

      try {
        const response = await authenticatedFetch<MeResponse>(
          getAccessToken,
          "/api/me",
          { signal: controller.signal },
        );

        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return;
        }

        if (response.role === "BRAND" || response.role === "OPERATOR") {
          writeCachedAccess(scope);
          setState({ scope, status: "authorized", error: null });
          return;
        }

        writeCachedAccess(null);
        setCached(null);
        setState({ scope, status: "redirecting", error: null });
        router.replace(response.role === "WORKER" ? "/worker" : "/");
      } catch (caught) {
        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return;
        }

        if (caught instanceof ClientApiError && (caught.status === 401 || caught.status === 403)) {
          writeCachedAccess(null);
          setCached(null);
          setState({ scope, status: "redirecting", error: null });
          router.replace("/");
          return;
        }

        setState({
          scope,
          status: "error",
          error:
            caught instanceof ClientApiError
              ? caught.message
              : "Could not verify access to this workspace.",
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
      writeCachedAccess(null);
      setCached(null);
      setState({ scope: null, status: "redirecting", error: null });
      router.replace("/");
      return;
    }

    void checkAccess(userId);

    return cancelRequest;
  }, [
    ready,
    authenticated,
    userId,
    checkAccess,
    cancelRequest,
    router,
  ]);

  const verified =
    Boolean(userId) && state.scope === userId && state.status === "authorized";
  // Optimistic: the same user was authorized recently and nothing has said otherwise.
  const optimistic =
    cached !== null &&
    (!ready || cached.userId === userId) &&
    state.status !== "redirecting" &&
    state.status !== "error";

  if (verified || optimistic) return children;

  if (state.scope === userId && state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-12">
        <div className="panel w-full max-w-md rounded-[24px] border border-line px-6 py-10 text-center">
          <h1 className="text-[20px] font-bold">Workspace access could not be verified</h1>
          <p className="mt-2 text-[13.5px] text-muted">{state.error}</p>
          {userId ? (
            <button
              onClick={() => void checkAccess(userId)}
              className="mt-5 h-10 rounded-xl bg-solid px-4 text-[13.5px] font-semibold text-solid-ink"
            >
              Try again
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return <PortalSkeleton />;
}
