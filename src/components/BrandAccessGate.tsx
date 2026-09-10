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

export default function BrandAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [state, setState] = useState<GateState>({
    scope: null,
    status: "checking",
    error: null,
  });

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
          setState({ scope, status: "authorized", error: null });
          return;
        }

        setState({ scope, status: "redirecting", error: null });
        router.replace(response.role === "WORKER" ? "/worker" : "/");
      } catch (caught) {
        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return;
        }

        if (caught instanceof ClientApiError && caught.status === 401) {
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

  const authorized =
    Boolean(userId) && state.scope === userId && state.status === "authorized";

  if (authorized) return children;

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

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <span className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-[13.5px] font-semibold text-muted">
        Checking workspace access…
      </span>
    </main>
  );
}
