"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { MeResponse } from "@/lib/auth/types";
import type { WorkerPingDto, WorkerWalletDto } from "@/lib/jobs/types";
import type { Job } from "@/lib/worker-data";

type JobResponse = { job: Job };
type AllJobsResponse = { place: Job[]; check: Job[]; mine: Job[] };

type Store = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** API error code, so callers can offer the right recovery action. */
  errorCode: string | null;
  placeJobs: Job[];
  checkJobs: Job[];
  myTasks: Job[];
  wallet: WorkerWalletDto | null;
  refresh: () => Promise<void>;
  jobById: (id: string) => Job | undefined;
  loadJob: (id: string) => Promise<Job>;
  acceptPlace: (id: string) => Promise<Job>;
  submitProof: (id: string, proof: PhotoProofInput) => Promise<Job>;
  acceptCheck: (id: string) => Promise<Job>;
  confirmPlacement: (id: string, proof: PhotoProofInput) => Promise<Job>;
  rejectPlacement: (id: string) => Promise<Job>;
  /** Shares one live position while the worker holds the job. */
  ping: (id: string, fix: PingInput) => Promise<WorkerPingDto>;
};

type PhotoProofInput = {
  photo: File;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  scannedShortCode?: string;
};

type PingInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

const WorkerContext = createContext<Store | null>(null);

function errorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : "Could not load your worker data. Please try again.";
}

function errorCodeOf(error: unknown) {
  return error instanceof ClientApiError ? (error.code ?? null) : null;
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [placeJobs, setPlaceJobs] = useState<Job[]>([]);
  const [checkJobs, setCheckJobs] = useState<Job[]>([]);
  const [myTasks, setMyTasks] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<WorkerWalletDto | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  // The profile is created once per session, not re-checked on every refresh.
  const profileChecked = useRef(false);

  const ensureWorkerProfile = useCallback(async () => {
    if (profileChecked.current) return;

    const me = await authenticatedFetch<MeResponse>(getAccessToken, "/api/me");
    profileChecked.current = true;

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
      const [lists, nextWallet] = await Promise.all([
        authenticatedFetch<AllJobsResponse>(
          getAccessToken,
          "/api/worker/jobs?tab=all",
        ),
        authenticatedFetch<WorkerWalletDto>(
          getAccessToken,
          "/api/worker/wallet",
        ),
      ]);

      setPlaceJobs(lists.place);
      setCheckJobs(lists.check);
      setMyTasks(lists.mine);
      setWallet(nextWallet);
      setJobs(mergeJobs(lists.place, lists.check, lists.mine));
    } catch (caught) {
      setError(errorMessage(caught));
      setErrorCode(errorCodeOf(caught));
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

      // The response already carries the updated job, so the screen can settle
      // immediately. The lists catch up in the background rather than making
      // the worker wait for them.
      setJobs((current) => mergeJobs(current, [response.job]));
      void refresh();
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

  const submitPhotoProof = useCallback(
    async (id: string, action: string, proof: PhotoProofInput) => {
      const photoPath = await uploadPhoto(id, proof.photo);

      return runAction(id, action, {
        photoPath,
        latitude: proof.latitude,
        longitude: proof.longitude,
        accuracyMeters: proof.accuracyMeters,
        scannedShortCode: proof.scannedShortCode,
      });
    },
    [runAction, uploadPhoto],
  );

  const submitProof = useCallback(
    (id: string, proof: PhotoProofInput) =>
      submitPhotoProof(id, "submit-proof", proof),
    [submitPhotoProof],
  );

  // The checker's own photo and location are independent proof: the
  // confidential check compares both before the escrow pays anyone.
  const confirmPlacement = useCallback(
    (id: string, proof: PhotoProofInput) =>
      submitPhotoProof(id, "confirm", proof),
    [submitPhotoProof],
  );

  // Deliberately does not refresh the job list: this fires every few seconds.
  const ping = useCallback(
    (id: string, fix: PingInput) =>
      authenticatedFetch<WorkerPingDto>(
        getAccessToken,
        `/api/worker/jobs/${id}/ping`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fix),
        },
      ),
    [getAccessToken],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      loading,
      error,
      errorCode,
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
      confirmPlacement,
      rejectPlacement: (id) => runAction(id, "reject"),
      ping,
    }),
    [
      ready,
      loading,
      error,
      errorCode,
      placeJobs,
      checkJobs,
      myTasks,
      wallet,
      refresh,
      jobs,
      loadJob,
      runAction,
      submitProof,
      confirmPlacement,
      ping,
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
