"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { MeResponse } from "@/lib/auth/types";
import type { WorkerWalletDto } from "@/lib/jobs/types";
import type { Job } from "@/lib/worker-data";

type JobsResponse = { jobs: Job[] };
type JobResponse = { job: Job };

type Store = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  placeJobs: Job[];
  checkJobs: Job[];
  myTasks: Job[];
  wallet: WorkerWalletDto | null;
  refresh: () => Promise<void>;
  jobById: (id: string) => Job | undefined;
  loadJob: (id: string) => Promise<Job>;
  acceptPlace: (id: string) => Promise<Job>;
  submitProof: (
    id: string,
    proof: { photo: File; latitude?: number; longitude?: number },
  ) => Promise<Job>;
  acceptCheck: (id: string) => Promise<Job>;
  confirmPlacement: (id: string) => Promise<Job>;
  rejectPlacement: (id: string) => Promise<Job>;
};

const WorkerContext = createContext<Store | null>(null);

function errorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : "Could not load your worker data. Please try again.";
}

function mergeJobs(...groups: Job[][]) {
  const byId = new Map<string, Job>();

  for (const job of groups.flat()) {
    byId.set(job.id, job);
  }

  return [...byId.values()];
}

export function WorkerProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = usePrivy();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeJobs, setPlaceJobs] = useState<Job[]>([]);
  const [checkJobs, setCheckJobs] = useState<Job[]>([]);
  const [myTasks, setMyTasks] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<WorkerWalletDto | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const ensureWorkerProfile = useCallback(async () => {
    const me = await authenticatedFetch<MeResponse>(getAccessToken, "/api/me");

    if (me.worker) return;

    await authenticatedFetch(getAccessToken, "/api/onboarding/worker", {
      method: "POST",
    });
  }, [getAccessToken]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await ensureWorkerProfile();
      const [place, check, mine, nextWallet] = await Promise.all([
        authenticatedFetch<JobsResponse>(getAccessToken, "/api/worker/jobs"),
        authenticatedFetch<JobsResponse>(
          getAccessToken,
          "/api/worker/jobs?tab=check",
        ),
        authenticatedFetch<JobsResponse>(
          getAccessToken,
          "/api/worker/jobs?tab=mine",
        ),
        authenticatedFetch<WorkerWalletDto>(
          getAccessToken,
          "/api/worker/wallet",
        ),
      ]);

      setPlaceJobs(place.jobs);
      setCheckJobs(check.jobs);
      setMyTasks(mine.jobs);
      setWallet(nextWallet);
      setJobs(mergeJobs(place.jobs, check.jobs, mine.jobs));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [ensureWorkerProfile, getAccessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadJob = useCallback(
    async (id: string) => {
      const response = await authenticatedFetch<JobResponse>(
        getAccessToken,
        `/api/worker/jobs/${id}`,
      );

      setJobs((current) => mergeJobs(current, [response.job]));
      return response.job;
    },
    [getAccessToken],
  );

  const runAction = useCallback(
    async (
      id: string,
      action: string,
      body: Record<string, unknown> = {},
    ) => {
      const response = await authenticatedFetch<JobResponse>(
        getAccessToken,
        `/api/worker/jobs/${id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        },
      );

      await refresh();
      return response.job;
    },
    [getAccessToken, refresh],
  );

  const uploadPhoto = useCallback(
    async (id: string, photo: File) => {
      const { signedUrl, path } = await authenticatedFetch<{
        signedUrl: string;
        path: string;
      }>(getAccessToken, `/api/worker/jobs/${id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: photo.type }),
      });

      const upload = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": photo.type },
        body: photo,
      });

      if (!upload.ok) {
        throw new ClientApiError(
          "Your photo could not be uploaded. Please try again.",
          upload.status,
          "UPLOAD_FAILED",
        );
      }

      return path;
    },
    [getAccessToken],
  );

  const submitProof = useCallback(
    async (
      id: string,
      proof: { photo: File; latitude?: number; longitude?: number },
    ) => {
      const photoPath = await uploadPhoto(id, proof.photo);

      return runAction(id, "submit-proof", {
        photoPath,
        latitude: proof.latitude,
        longitude: proof.longitude,
      });
    },
    [runAction, uploadPhoto],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      loading,
      error,
      placeJobs,
      checkJobs,
      myTasks,
      wallet,
      refresh,
      jobById: (id) => jobs.find((job) => job.id === id),
      loadJob,
      acceptPlace: (id) => runAction(id, "accept-placement"),
      submitProof,
      acceptCheck: (id) => runAction(id, "accept-check"),
      confirmPlacement: (id) => runAction(id, "confirm"),
      rejectPlacement: (id) => runAction(id, "reject"),
    }),
    [
      ready,
      loading,
      error,
      placeJobs,
      checkJobs,
      myTasks,
      wallet,
      refresh,
      jobs,
      loadJob,
      runAction,
      submitProof,
    ],
  );

  return (
    <WorkerContext.Provider value={value}>{children}</WorkerContext.Provider>
  );
}

export function useWorker() {
  const store = useContext(WorkerContext);
  if (!store) throw new Error("useWorker must be used inside WorkerProvider");
  return store;
}
