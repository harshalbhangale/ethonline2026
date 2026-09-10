"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthPrompt from "@/components/AuthPrompt";
import CampaignStatusBadge from "@/components/campaigns/CampaignStatusBadge";
import { Card, PageHeading } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import {
  formatOptionalCampaignBudget,
  formatOptionalCampaignDate,
  formatOptionalPlacements,
  notSetLabel,
} from "@/lib/campaigns/format";
import type { CampaignListResponse } from "@/lib/campaigns/types";

type DashboardLoadState = {
  scope: string | null;
  data: CampaignListResponse | null;
  loading: boolean;
  error: string | null;
};

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-[20px] bg-raised" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[20px] bg-raised" />
    </div>
  );
}

export default function BrandDashboard() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const [loadState, setLoadState] = useState<DashboardLoadState>({
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

  const loadCampaigns = useCallback(async () => {
    if (!userId) return;

    const scope = userId;
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
      const data = await authenticatedFetch<CampaignListResponse>(
        getAccessToken,
        "/api/campaigns",
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
          caught instanceof Error ? caught.message : "Could not load campaigns.",
      }));
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [getAccessToken, userId]);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !userId) {
      cancelRequest();
      setLoadState({
        scope: null,
        data: null,
        loading: false,
        error: null,
      });
      return;
    }

    void loadCampaigns();
    return cancelRequest;
  }, [ready, authenticated, userId, loadCampaigns, cancelRequest]);

  const currentState: DashboardLoadState =
    userId && loadState.scope === userId
      ? loadState
      : {
          scope: userId,
          data: null,
          loading: !ready || Boolean(userId),
          error: null,
        };
  const { data, loading, error } = currentState;

  const stats = useMemo(() => {
    const campaigns = data?.campaigns ?? [];
    return {
      campaigns: campaigns.length,
      drafts: campaigns.filter((campaign) => campaign.status === "DRAFT").length,
      placements: campaigns.reduce(
        (total, campaign) => total + (campaign.placementCount ?? 0),
        0,
      ),
    };
  }, [data]);

  return (
    <>
      <PageHeading
        title={data?.organization.name ?? "Campaigns"}
        sub="Create, fund and monitor every physical campaign from one workspace."
        action={
          userId ? (
            <Link
              href="/brand/new"
              className="hidden h-11 items-center rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90 sm:inline-flex"
            >
              New campaign
            </Link>
          ) : undefined
        }
      />

      {!ready || loading ? <DashboardSkeleton /> : null}

      {ready && !authenticated ? (
        <AuthPrompt onSignIn={() => void login()} />
      ) : null}

      {ready && userId && !loading && error ? (
        <Card className="px-6 py-8 text-center">
          <h2 className="text-[17px] font-bold">Campaigns could not be loaded</h2>
          <p className="mt-2 text-[13.5px] text-muted">{error}</p>
          <button
            onClick={() => void loadCampaigns()}
            className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
          >
            Try again
          </button>
        </Card>
      ) : null}

      {ready && userId && !loading && !error && data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Campaigns", stats.campaigns, "Saved to this workspace"],
              ["Drafts", stats.drafts, "Ready for quote review"],
              ["Placements", stats.placements, "Across all campaigns"],
            ].map(([label, value, helper]) => (
              <Card key={label} className="px-5 py-5">
                <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-faint">{label}</p>
                <p className="mt-2 text-[30px] font-extrabold tracking-[-0.03em]">{value}</p>
                <p className="mt-1 text-[12.5px] text-muted">{helper}</p>
              </Card>
            ))}
          </div>

          {data.campaigns.length === 0 ? (
            <Card gradient className="px-6 py-12 text-center sm:px-10">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-raised text-badge">01</span>
              <h2 className="mt-4 text-[20px] font-bold tracking-[-0.02em]">Create your first campaign</h2>
              <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
                Describe where the assets should go, set a budget and save a persistent draft.
              </p>
              <Link
                href="/brand/new"
                className="mt-6 inline-flex h-11 items-center rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink"
              >
                Start a campaign
              </Link>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-[16px] font-bold">Recent campaigns</h2>
                  <p className="text-[12.5px] text-muted">Updated whenever campaign details change.</p>
                </div>
                <button
                  onClick={() => void loadCampaigns()}
                  className="text-[12.5px] font-semibold text-muted hover:text-ink"
                >
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-line">
                {data.campaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/brand/campaigns/${campaign.id}`}
                    className="grid gap-4 px-5 py-5 transition-colors hover:bg-raised/60 sm:grid-cols-[minmax(0,1fr)_130px_130px_110px] sm:items-center sm:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="truncate text-[15px] font-bold">{campaign.name}</h3>
                        <CampaignStatusBadge status={campaign.status} />
                      </div>
                      <p className="mt-1 truncate text-[12.5px] text-muted">{campaign.areaLabel ?? notSetLabel}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Budget</p>
                      <p className="mt-1 text-[13px] font-semibold">{formatOptionalCampaignBudget(campaign.budgetLimit, campaign.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Deadline</p>
                      <p className="mt-1 text-[13px] font-semibold">{formatOptionalCampaignDate(campaign.deadline)}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[13px] font-semibold">{formatOptionalPlacements(campaign.placementCount)}</p>
                      <p className="mt-1 text-[11.5px] text-faint">Open →</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
