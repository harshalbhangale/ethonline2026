"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import type { LiveCampaignResponse } from "@/lib/placements/live";

const REFRESH_MS = 30_000;

const statusText: Record<string, string> = {
  VERIFIED: "Up and verified",
  REMOVING: "Coming down",
  REMOVED: "Removed",
  CANCELLED: "Cancelled",
  NEEDS_RECAPTURE: "Needs a new photo",
  READY_FOR_FINAL_VERIFICATION: "Being verified",
};

function rate(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/**
 * What each poster produced: scans, people, landings and signups, with the
 * campaign totals above. Shown once posters start going up, and kept after
 * the campaign completes.
 */
export default function CampaignResults({
  campaignId,
  complete,
}: {
  campaignId: string;
  complete: boolean;
}) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<LiveCampaignResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await authenticatedFetch<LiveCampaignResponse>(
          getAccessToken,
          `/api/campaigns/${campaignId}/live`,
        ),
      );
    } catch {
      // The live map shows connection problems; results just keep the last read.
    }
  }, [campaignId, getAccessToken]);

  useEffect(() => {
    void load();
    if (complete) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, complete]);

  if (!data) {
    return <div className="h-48 animate-pulse rounded-[20px] bg-raised" />;
  }

  const totals = data.placements.reduce(
    (sum, placement) => ({
      scans: sum.scans + placement.stats.scans,
      people: sum.people + placement.stats.uniqueScanners,
      landings: sum.landings + placement.stats.landings,
      conversions: sum.conversions + placement.stats.conversions,
    }),
    { scans: 0, people: 0, landings: 0, conversions: 0 },
  );
  const up = data.placements.filter((placement) => placement.status === "VERIFIED").length;
  const ranked = [...data.placements].sort((a, b) => b.stats.scans - a.stats.scans);
  const best = ranked[0]?.stats.scans ? ranked[0] : null;

  const tiles = [
    { label: "Posters up", value: `${up} / ${data.placements.length}` },
    { label: "Scans", value: totals.scans },
    { label: "People", value: totals.people },
    { label: "Landed", value: totals.landings, sub: rate(totals.landings, totals.people) },
    { label: "Signed up", value: totals.conversions, sub: rate(totals.conversions, totals.landings) },
  ] as { label: string; value: string | number; sub?: string }[];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[16px] font-bold">{complete ? "Campaign results" : "Results so far"}</h2>
          <p className="text-[12.5px] text-muted">
            Every poster, and what it produced. Suspected bots are left out.
          </p>
        </div>
        {best ? (
          <p className="text-[12.5px] text-muted">
            Best poster: <span className="font-semibold text-ink">{best.venueName}</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-bg px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{tile.label}</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.02em]">
              {typeof tile.value === "number" ? <CountUp value={tile.value} /> : tile.value}
            </p>
            {tile.sub ? <p className="text-[11.5px] text-muted">{tile.sub} of the step before</p> : null}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="border-y border-line text-[11px] uppercase tracking-[0.08em] text-faint">
            <tr>
              <th className="px-6 py-2.5 font-bold">Poster</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-3 py-2.5 text-right font-bold">Scans</th>
              <th className="px-3 py-2.5 text-right font-bold">People</th>
              <th className="px-3 py-2.5 text-right font-bold">Landed</th>
              <th className="px-6 py-2.5 text-right font-bold">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((placement) => (
              <tr key={placement.id} className="border-b border-line last:border-0">
                <td className="px-6 py-3">
                  <p className="font-semibold">{placement.venueName}</p>
                  <p className="font-mono text-[11.5px] text-faint">{placement.shortCode}</p>
                </td>
                <td className="px-3 py-3 text-muted">{statusText[placement.status] ?? "Not up yet"}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{placement.stats.scans}</td>
                <td className="px-3 py-3 text-right tabular-nums">{placement.stats.uniqueScanners}</td>
                <td className="px-3 py-3 text-right tabular-nums">{placement.stats.landings}</td>
                <td className="px-6 py-3 text-right tabular-nums">{placement.stats.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
