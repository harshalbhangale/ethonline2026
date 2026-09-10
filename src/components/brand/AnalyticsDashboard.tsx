"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PageHeading } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { AnalyticsResponse } from "@/lib/analytics/types";

const refreshIntervalMs = 15_000;

type LoadState = {
  scope: string | null;
  data: AnalyticsResponse | null;
  loading: boolean;
  error: string | null;
};

function ScanTrend({ trend }: { trend: AnalyticsResponse["trend"] }) {
  const peak = Math.max(1, ...trend.map((point) => point.totalScans));

  return (
    <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Scans per day">
      {trend.map((point) => (
        <div key={point.date} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            title={`${point.date}: ${point.totalScans} scans`}
            style={{ height: `${Math.max(2, (point.totalScans / peak) * 100)}%` }}
            className={`w-full rounded-t ${
              point.totalScans > 0 ? "bg-badge" : "bg-line"
            }`}
          />
          <span className="text-[9.5px] text-faint">
            {point.date.slice(8, 10)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;

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

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!userId) return;

      const scope = userId;
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;

      if (!quiet) {
        setLoadState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: true,
          error: null,
        }));
      }

      try {
        const data = await authenticatedFetch<AnalyticsResponse>(
          getAccessToken,
          "/api/analytics",
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
            caught instanceof ClientApiError
              ? caught.message
              : "Could not load scan analytics.",
        }));
      } finally {
        if (sequence === requestSequence.current) {
          requestController.current = null;
        }
      }
    },
    [getAccessToken, userId],
  );

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !userId) {
      cancelRequest();
      setLoadState({ scope: null, data: null, loading: false, error: null });
      return;
    }

    void load();

    // Short polling keeps a live demo honest without a realtime dependency.
    const timer = window.setInterval(() => void load({ quiet: true }), refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
      cancelRequest();
    };
  }, [ready, authenticated, userId, load, cancelRequest]);

  const current: LoadState =
    userId && loadState.scope === userId
      ? loadState
      : { scope: userId, data: null, loading: true, error: null };
  const { data, loading, error } = current;

  return (
    <>
      <PageHeading
        title="Analytics"
        sub="See how each physical asset performs, attributed individually."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="hidden h-11 items-center rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised sm:inline-flex"
          >
            Refresh
          </button>
        }
      />

      {loading && !data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-[20px] bg-raised" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-[20px] bg-raised" />
        </div>
      ) : null}

      {error && !data ? (
        <Card className="px-6 py-8 text-center">
          <h2 className="text-[17px] font-bold">Analytics could not be loaded</h2>
          <p className="mt-2 text-[13.5px] text-muted">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
          >
            Try again
          </button>
        </Card>
      ) : null}

      {data ? (
        data.summary.assetCount === 0 ? (
          <Card gradient className="px-6 py-12 text-center sm:px-10">
            <h2 className="text-[20px] font-bold tracking-[-0.02em]">
              No scannable assets yet
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              Attribution begins once a campaign is funded and its posters are
              generated. Each poster carries its own short code, so every
              placement reports separately.
            </p>
            <Link
              href="/brand/new"
              className="mt-6 inline-flex h-11 items-center rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink"
            >
              Create a campaign
            </Link>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [
                  "Total scans",
                  data.summary.totalScans,
                  "Every scan, including repeats",
                ],
                [
                  "Estimated unique",
                  data.summary.estimatedUniqueScans,
                  "Distinct sessions, an estimate",
                ],
                [
                  "Live assets",
                  data.summary.assetCount,
                  `Across ${data.summary.campaignsWithAssets} ${
                    data.summary.campaignsWithAssets === 1
                      ? "campaign"
                      : "campaigns"
                  }`,
                ],
              ].map(([label, value, helper]) => (
                <Card key={String(label)} className="px-5 py-5">
                  <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-faint">
                    {label}
                  </p>
                  <p className="mt-2 text-[30px] font-extrabold tabular-nums tracking-[-0.03em]">
                    {value}
                  </p>
                  <p className="mt-1 text-[12.5px] text-muted">{helper}</p>
                </Card>
              ))}
            </div>

            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-bold">
                  Scans over the last {data.trendDays} days
                </h2>
                {data.summary.suspectedBotScans > 0 ? (
                  <p className="text-[12px] text-faint">
                    {data.summary.suspectedBotScans} flagged as automated
                  </p>
                ) : null}
              </div>
              <ScanTrend trend={data.trend} />
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-4 sm:px-6">
                <h2 className="text-[16px] font-bold">Scans by physical asset</h2>
                <p className="text-[12.5px] text-muted">
                  Each poster has its own short code, so results never blur
                  together.
                </p>
              </div>
              <div className="divide-y divide-line">
                {data.assets.map((asset) => (
                  <div
                    key={asset.assetId}
                    className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_90px_90px] sm:items-center sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">
                        Poster {asset.sequence} —{" "}
                        {asset.venueName ?? "Approved location"}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        <Link
                          href={`/brand/campaigns/${asset.campaignId}`}
                          className="hover:text-ink"
                        >
                          {asset.campaignName}
                        </Link>
                        <span className="ml-2 font-mono text-faint">
                          {asset.shortCode}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                        Scans
                      </p>
                      <p className="mt-0.5 text-[15px] font-bold tabular-nums">
                        {asset.totalScans}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                        Unique
                      </p>
                      <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                        {asset.estimatedUniqueScans}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <p className="text-[11.5px] leading-relaxed text-faint">
              Scans are engagement analytics only. They do not prove a poster was
              installed and never trigger a worker payout. Visitor identity is
              never stored, only salted one-way hashes.
            </p>
          </div>
        )
      ) : null}
    </>
  );
}
