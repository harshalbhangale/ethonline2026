"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { formatCampaignBudget } from "@/lib/campaigns/format";
import { explorerTxUrl } from "@/lib/chain/explorer";
import {
  demoStepLabels,
  describeReason,
  jobRoleLabels,
  jobStatusLabels,
  placementStatusLabels,
  placementSteps,
  placementStepsDone,
} from "@/lib/placements/format";
import type {
  PlacementDto,
  PlacementListResponse,
  PlacementStatusValue,
  VerificationRunDto,
} from "@/lib/placements/types";
import { transactionKindLabel } from "@/lib/treasury/format";

type LoadState = {
  scope: string | null;
  data: PlacementListResponse | null;
  loading: boolean;
  error: string | null;
};

type DemoBody = { action: string; placementId?: string; fraudulent?: boolean };
type Notice = { tone: "ok" | "fail"; text: string } | null;

const POLL_MS = 5_000;
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const statusStyles: Record<PlacementStatusValue, string> = {
  AWAITING_INSTALL: "border-line text-muted",
  INSTALLING: "border-scan/40 text-scan",
  INSTALL_SUBMITTED: "border-badge/40 text-badge",
  AWAITING_VERIFIER: "border-badge/40 text-badge",
  VERIFYING: "border-scan/40 text-scan",
  READY_FOR_FINAL_VERIFICATION: "border-badge/40 text-badge",
  VERIFIED: "border-paid/40 text-paid",
  NEEDS_RECAPTURE: "border-fail/40 text-fail",
  REMOVING: "border-scan/40 text-scan",
  REMOVED: "border-line text-faint",
  CANCELLED: "border-fail/40 text-fail",
};

function isRunning(verification: VerificationRunDto | null) {
  return verification?.status === "RUNNING" || verification?.status === "QUEUED";
}

function PlacementProgress({ status }: { status: PlacementStatusValue }) {
  const done = placementStepsDone[status];

  return (
    <ol className="flex items-center gap-1.5" aria-label={`${done} of ${placementSteps.length} steps complete`}>
      {placementSteps.map((step, index) => (
        <li key={step} title={step} className={`h-1.5 w-8 rounded-full ${index < done ? "bg-paid" : "bg-line"}`} />
      ))}
    </ol>
  );
}

type RoadmapStage = { key: string; label: string; count: number; done: boolean };

/**
 * Campaign-wide lifecycle tracker. Placement-level dot progress (below) shows
 * one poster's journey; this shows where the whole campaign's posters stand
 * at a glance, which is what a brand actually wants to know first.
 */
function CampaignRoadmap({ placements }: { placements: PlacementDto[] }) {
  const bucket = (statuses: PlacementStatusValue[]) =>
    placements.filter((placement) => statuses.includes(placement.status)).length;

  const awaitingInstall = bucket(["AWAITING_INSTALL"]);
  const installing = bucket(["INSTALLING", "INSTALL_SUBMITTED", "NEEDS_RECAPTURE"]);
  const verifying = bucket(["AWAITING_VERIFIER", "VERIFYING", "READY_FOR_FINAL_VERIFICATION"]);
  const verified = bucket(["VERIFIED", "REMOVING", "REMOVED"]);

  const stages: RoadmapStage[] = [
    { key: "live", label: "Posters live", count: placements.length, done: placements.length > 0 },
    { key: "installing", label: "Being installed", count: installing, done: installing + verifying + verified > 0 },
    { key: "verifying", label: "Independent check", count: verifying, done: verifying + verified > 0 },
    { key: "verified", label: "Verified & paid", count: verified, done: verified > 0 },
  ];

  return (
    <Card className="px-5 py-5 sm:px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Campaign roadmap</p>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {stages.map((stage, index) => (
          <li key={stage.key} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span
                className={`h-2 flex-1 rounded-full ${index === 0 || stages[index - 1].done ? (stage.done ? "bg-paid" : "bg-badge/60") : "bg-line"}`}
              />
            </div>
            <p className="mt-2 text-[19px] font-extrabold tracking-[-0.03em]">{stage.count}</p>
            <p className="text-[11.5px] font-semibold text-muted">{stage.label}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted">
        {awaitingInstall > 0
          ? `${awaitingInstall} poster${awaitingInstall === 1 ? "" : "s"} still waiting for a worker to accept the job. `
          : ""}
        Every open job is visible to all workers as soon as it appears here.
      </p>
    </Card>
  );
}

function VerificationLine({ verification }: { verification: VerificationRunDto | null }) {
  if (!verification) return null;

  if (isRunning(verification)) {
    return (
      <p className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-badge">
        <span className="h-2 w-2 animate-pulse rounded-full bg-badge" />
        Verifying both proofs…
      </p>
    );
  }

  if (verification.approved === true) {
    return (
      <p className="mt-2 text-[12px] font-semibold text-paid">
        Verification passed; escrow paid both workers.
        {verification.txHash ? (
          <a href={explorerTxUrl(verification.txHash)} target="_blank" rel="noreferrer" className="ml-2 underline">
            Report tx ↗
          </a>
        ) : null}
      </p>
    );
  }

  if (verification.approved === false) {
    return (
      <div className="mt-2 text-[12px] text-fail">
        <p className="font-semibold">
          Verification rejected the proof. Payment stays locked in escrow.
          {verification.txHash ? (
            <a href={explorerTxUrl(verification.txHash)} target="_blank" rel="noreferrer" className="ml-2 underline">
              Report tx ↗
            </a>
          ) : null}
        </p>
        <p className="mt-0.5">{verification.reasons.map(describeReason).join(" · ")}</p>
      </div>
    );
  }

  return (
    <p className="mt-2 text-[12px] font-semibold text-fail">
      The last verification run did not finish. Run it again.
    </p>
  );
}

function PlacementRow({
  placement,
  showCampaign,
  demo,
}: {
  placement: PlacementDto;
  showCampaign: boolean;
  demo: {
    busy: string | null;
    verificationAvailable: boolean;
    run: (body: DemoBody, label: string) => void;
  } | null;
}) {
  const nextStep = demoStepLabels[placement.status];
  const running = isRunning(placement.verification);
  const needsCre = placement.status === "READY_FOR_FINAL_VERIFICATION";

  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px_150px_170px] sm:items-center">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold">{placement.location.venueName}</h3>
          <p className="mt-1 truncate text-[12.5px] text-muted">
            {showCampaign ? `${placement.campaign.name} · ` : ""}
            {placement.location.city}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {placement.jobs.map((job) => (
              <span key={job.role} className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium text-muted">
                {jobRoleLabels[job.role]} · {jobStatusLabels[job.status]} · {formatCampaignBudget(job.reward, job.currency)}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Asset</p>
          <p className="mt-1 font-mono text-[13px] font-semibold">
            #{placement.asset.sequence} · {placement.asset.shortCode}
          </p>
        </div>
        <PlacementProgress status={placement.status} />
        <div className="sm:text-right">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${statusStyles[placement.status]}`}>
            {placementStatusLabels[placement.status]}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]">
        <span className={placement.onchain.placementKey ? "font-semibold text-paid" : "text-faint"}>
          {placement.onchain.placementKey ? "● Rewards reserved in escrow" : "○ Not yet in escrow"}
        </span>
        {placement.proofs.installer ? (
          <span className="text-muted">Installer proof {placement.proofs.installer.toLowerCase()}</span>
        ) : null}
        {placement.proofs.verifier ? (
          <span className="text-muted">Verifier proof {placement.proofs.verifier.toLowerCase()}</span>
        ) : null}
        {placement.transactions.map((transaction) => (
          <a
            key={`${transaction.txHash}-${transaction.kind}`}
            href={explorerTxUrl(transaction.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-badge hover:underline"
          >
            {transactionKindLabel(transaction.kind)} ↗
          </a>
        ))}
      </div>

      <VerificationLine verification={placement.verification} />

      {demo && nextStep ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={demo.busy !== null || running || (needsCre && !demo.verificationAvailable)}
            onClick={() => demo.run({ action: "advance-placement", placementId: placement.id }, placement.id)}
            className="h-8 rounded-lg border border-line px-3 text-[12px] font-semibold hover:bg-raised disabled:opacity-50"
          >
            {demo.busy === placement.id ? "Working…" : running ? "Verifying…" : nextStep}
          </button>
          {placement.status === "INSTALLING" ? (
            <button
              type="button"
              disabled={demo.busy !== null}
              onClick={() =>
                demo.run({ action: "advance-placement", placementId: placement.id, fraudulent: true }, `${placement.id}-bad`)
              }
              className="h-8 rounded-lg border border-fail/40 px-3 text-[12px] font-semibold text-fail hover:bg-fail/5 disabled:opacity-50"
            >
              {demo.busy === `${placement.id}-bad` ? "Working…" : "Stick & verify from the wrong place"}
            </button>
          ) : null}
          {needsCre && !demo.verificationAvailable ? (
            <span className="self-center text-[11.5px] text-faint">Verification is not available on this server.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Brand view of physical placements, for one campaign or the whole workspace.
 *
 * Shows progress, escrow state and verification outcomes. Worker identities
 * and exact coordinates never reach the brand.
 */
export default function PlacementBoard({
  campaignId,
  funded = true,
  showCampaign = false,
}: {
  campaignId?: string;
  funded?: boolean;
  showCampaign?: boolean;
}) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const endpoint = campaignId ? `/api/campaigns/${campaignId}/placements` : "/api/placements";
  const requestScope = userId ? `${userId}:${endpoint}` : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    scope: null,
    data: null,
    loading: true,
    error: null,
  });
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [retrying, setRetrying] = useState(false);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadPlacements = useCallback(
    async (silent = false) => {
      if (!requestScope) return;

      const scope = requestScope;
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;

      if (!silent) {
        setLoadState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: true,
          error: null,
        }));
      }

      try {
        const data = await authenticatedFetch<PlacementListResponse>(getAccessToken, endpoint, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setLoadState({ scope, data, loading: false, error: null });
      } catch (caught) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setLoadState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: false,
          error: caught instanceof Error ? caught.message : "Could not load placements.",
        }));
      } finally {
        if (sequence === requestSequence.current) {
          requestController.current = null;
        }
      }
    },
    [endpoint, getAccessToken, requestScope],
  );

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !requestScope) {
      cancelRequest();
      setLoadState({ scope: null, data: null, loading: false, error: null });
      return;
    }

    void loadPlacements();
    return cancelRequest;
  }, [ready, authenticated, requestScope, loadPlacements, cancelRequest]);

  const current =
    requestScope && loadState.scope === requestScope
      ? loadState
      : { data: null, loading: !ready || Boolean(requestScope), error: null };
  const { data, loading, error } = current;
  const anyRunning = Boolean(data?.placements.some((placement) => isRunning(placement.verification)));

  // Follow confidential verification runs until they settle onchain.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void loadPlacements(true), POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, loadPlacements]);

  const runDemo = useCallback(
    async (body: DemoBody, label: string) => {
      if (!campaignId || !requestScope) return;
      setDemoBusy(label);
      setNotice(null);
      try {
        const result = await authenticatedFetch<PlacementListResponse & { message: string }>(
          getAccessToken,
          `/api/campaigns/${campaignId}/demo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        ++requestSequence.current;
        setLoadState({ scope: requestScope, data: result, loading: false, error: null });
        setNotice({ tone: "ok", text: result.message });
      } catch (caught) {
        setNotice({ tone: "fail", text: caught instanceof Error ? caught.message : "Demo step failed." });
        void loadPlacements(true);
      } finally {
        setDemoBusy(null);
      }
    },
    [campaignId, getAccessToken, loadPlacements, requestScope],
  );

  const retryAssetGeneration = useCallback(async () => {
    if (!campaignId) return;
    setRetrying(true);
    setNotice(null);
    try {
      await authenticatedFetch(getAccessToken, `/api/campaigns/${campaignId}/assets/generate`, {
        method: "POST",
      });
      await loadPlacements();
    } catch (caught) {
      setNotice({
        tone: "fail",
        text: caught instanceof Error ? caught.message : "Could not open jobs for workers.",
      });
    } finally {
      setRetrying(false);
    }
  }, [campaignId, getAccessToken, loadPlacements]);

  if (!ready || (loading && !data)) {
    return <div className="h-48 animate-pulse rounded-[20px] bg-raised" />;
  }

  if (!requestScope) return null;

  if (error && !data) {
    return (
      <Card className="px-6 py-8 text-center">
        <h2 className="text-[17px] font-bold">Placements could not be loaded</h2>
        <p className="mt-2 text-[13.5px] text-muted">{error}</p>
        <button
          onClick={() => void loadPlacements()}
          className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (!data) return null;

  const demoControls =
    campaignId && demoMode ? (
      <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line px-5 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Operator controls</p>
        <button
          type="button"
          disabled={demoBusy !== null}
          onClick={() => void runDemo({ action: "mark-printing-complete" }, "printing")}
          className="h-8 rounded-lg border border-line px-3 text-[12px] font-semibold hover:bg-raised disabled:opacity-50"
        >
          {demoBusy === "printing" ? "Working…" : "Mark printing complete"}
        </button>
        <button
          type="button"
          disabled={demoBusy !== null}
          onClick={() => void runDemo({ action: "generate-activity" }, "activity")}
          className="h-8 rounded-lg border border-line px-3 text-[12px] font-semibold hover:bg-raised disabled:opacity-50"
        >
          {demoBusy === "activity" ? "Working…" : "Sync scan activity"}
        </button>
        <span className="text-[11.5px] text-faint">Each placement has its own next step below.</span>
      </div>
    ) : null;

  const noticeBanner = notice ? (
    <div
      className={`border-b px-5 py-3 text-[12.5px] sm:px-6 ${
        notice.tone === "ok" ? "border-paid/25 bg-paid/5 text-paid" : "border-fail/25 bg-fail/5 text-fail"
      }`}
    >
      {notice.text}
    </div>
  ) : null;

  if (data.placements.length === 0) {
    return (
      <Card className="overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-[16px] font-bold">Placements</h2>
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
            {funded
              ? "Posters are still being generated for this campaign's locations. This is normally instant — if it's been more than a minute, try opening jobs again below."
              : "Placements open the moment the campaign is funded: posters are generated and every job is immediately visible to all workers."}
          </p>
          {funded && campaignId ? (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void retryAssetGeneration()}
              className="mt-4 h-9 rounded-lg border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised disabled:opacity-50"
            >
              {retrying ? "Opening jobs…" : "Open jobs for workers"}
            </button>
          ) : null}
          {notice ? (
            <p className={`mt-3 text-[12.5px] ${notice.tone === "ok" ? "text-paid" : "text-fail"}`}>{notice.text}</p>
          ) : null}
        </div>
      </Card>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
      <CampaignRoadmap placements={data.placements} />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Placements", summary.total],
          ["Awaiting installer", summary.awaitingInstall],
          ["In progress", summary.inProgress],
          ["Verified", summary.verified],
        ].map(([label, value]) => (
          <Card key={label} className="px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{label}</p>
            <p className="mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[16px] font-bold">Placements</h2>
            <p className="text-[12.5px] text-muted">
              Installation, independent verification and escrow settlement. Worker identities stay private.
            </p>
          </div>
          <button
            onClick={() => void loadPlacements()}
            className="text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {noticeBanner}
        <div className="divide-y divide-line">
          {data.placements.map((placement) => (
            <PlacementRow
              key={placement.id}
              placement={placement}
              showCampaign={showCampaign}
              demo={
                campaignId && demoMode
                  ? {
                      busy: demoBusy,
                      verificationAvailable: data.verificationAvailable,
                      run: (body, label) => void runDemo(body, label),
                    }
                  : null
              }
            />
          ))}
        </div>
        {demoControls}
      </Card>
    </div>
  );
}
