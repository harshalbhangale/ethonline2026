"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { formatCampaignBudget } from "@/lib/campaigns/format";
import {
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
} from "@/lib/placements/types";

type LoadState = {
  scope: string | null;
  data: PlacementListResponse | null;
  loading: boolean;
  error: string | null;
};

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

function PlacementProgress({ status }: { status: PlacementStatusValue }) {
  const done = placementStepsDone[status];

  return (
    <ol
      className="flex items-center gap-1.5"
      aria-label={`${done} of ${placementSteps.length} steps complete`}
    >
      {placementSteps.map((step, index) => (
        <li
          key={step}
          title={step}
          className={`h-1.5 w-8 rounded-full ${index < done ? "bg-paid" : "bg-line"}`}
        />
      ))}
    </ol>
  );
}

function PlacementRow({
  placement,
  showCampaign,
}: {
  placement: PlacementDto;
  showCampaign: boolean;
}) {
  return (
    <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_110px_150px_170px] sm:items-center sm:px-6">
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-bold">{placement.location.venueName}</h3>
        <p className="mt-1 truncate text-[12.5px] text-muted">
          {showCampaign ? `${placement.campaign.name} · ` : ""}
          {placement.location.city}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {placement.jobs.map((job) => (
            <span
              key={job.role}
              className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium text-muted"
            >
              {jobRoleLabels[job.role]} · {jobStatusLabels[job.status]} ·{" "}
              {formatCampaignBudget(job.reward, job.currency)}
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
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${statusStyles[placement.status]}`}
        >
          {placementStatusLabels[placement.status]}
        </span>
      </div>
    </div>
  );
}

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const demoButtons = [
  ["mark-printing-complete", "Mark printing complete"],
  ["simulate-installer-proof", "Simulate installer proof"],
  ["reset-placements", "Reset placements"],
] as const;

/** Development-only shortcuts. The server refuses them unless demo mode is on. */
function DemoControls({
  campaignId,
  getAccessToken,
  onChanged,
}: {
  campaignId: string;
  getAccessToken: () => Promise<string | null>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string) {
    setBusy(action);
    setError(null);

    try {
      await authenticatedFetch<PlacementListResponse>(
        getAccessToken,
        `/api/campaigns/${campaignId}/demo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-dashed border-line px-5 py-4 sm:px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
        Demo controls · development only
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {demoButtons.map(([action, label]) => (
          <button
            key={action}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(action)}
            className="h-9 rounded-xl border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised disabled:opacity-50"
          >
            {busy === action ? "Working…" : label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-[12.5px] text-fail">{error}</p> : null}
    </div>
  );
}

/**
 * Brand view of physical placements, for one campaign or the whole workspace.
 *
 * Shows progress and rewards only. Worker identities never reach the brand.
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
  const endpoint = campaignId
    ? `/api/campaigns/${campaignId}/placements`
    : "/api/placements";
  const requestScope = userId ? `${userId}:${endpoint}` : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    scope: null,
    data: null,
    loading: true,
    error: null,
  });

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadPlacements = useCallback(async () => {
    if (!requestScope) return;

    const scope = requestScope;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;

    setLoadState((previous) => ({
      scope,
      data: previous.scope === scope ? previous.data : null,
      loading: true,
      error: null,
    }));

    try {
      const data = await authenticatedFetch<PlacementListResponse>(
        getAccessToken,
        endpoint,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setLoadState({ scope, data, loading: false, error: null });
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setLoadState((previous) => ({
        scope,
        data: previous.scope === scope ? previous.data : null,
        loading: false,
        error:
          caught instanceof Error ? caught.message : "Could not load placements.",
      }));
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [endpoint, getAccessToken, requestScope]);

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

  const { data, loading, error } =
    requestScope && loadState.scope === requestScope
      ? loadState
      : { data: null, loading: !ready || Boolean(requestScope), error: null };

  if (!ready || loading) {
    return <div className="h-48 animate-pulse rounded-[20px] bg-raised" />;
  }

  if (!requestScope) return null;

  if (error || !data) {
    return (
      <Card className="px-6 py-8 text-center">
        <h2 className="text-[17px] font-bold">Placements could not be loaded</h2>
        <p className="mt-2 text-[13.5px] text-muted">{error ?? "No data returned."}</p>
        <button
          onClick={() => void loadPlacements()}
          className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
        >
          Try again
        </button>
      </Card>
    );
  }

  const demoControls =
    campaignId && demoMode ? (
      <DemoControls
        campaignId={campaignId}
        getAccessToken={getAccessToken}
        onChanged={() => void loadPlacements()}
      />
    ) : null;

  if (data.placements.length === 0) {
    return (
      <Card className="overflow-hidden">
        <div className="px-6 py-8">
          <h2 className="text-[16px] font-bold">Placements</h2>
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
            {funded
              ? "Installation jobs open for each approved location as soon as this campaign's QR assets are generated."
              : "Placements open once the campaign is funded and one QR asset is generated for each approved location."}
          </p>
        </div>
        {funded ? demoControls : null}
      </Card>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
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
              Installation and independent verification progress. Worker identities stay private.
            </p>
          </div>
          <button
            onClick={() => void loadPlacements()}
            className="text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            Refresh
          </button>
        </div>
        <div className="divide-y divide-line">
          {data.placements.map((placement) => (
            <PlacementRow
              key={placement.id}
              placement={placement}
              showCampaign={showCampaign}
            />
          ))}
        </div>
        {demoControls}
      </Card>
    </div>
  );
}
