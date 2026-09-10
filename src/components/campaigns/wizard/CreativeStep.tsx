"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { CampaignAssetsResponse } from "@/lib/assets/types";
import { normalizeCampaignDestination } from "@/lib/campaigns/destination";
import type { CampaignDto } from "@/lib/campaigns/types";

export default function CreativeStep({
  campaign,
  submitting,
  onContinue,
}: {
  campaign: CampaignDto;
  submitting: boolean;
  onContinue: (destinationUrl: string) => Promise<void>;
}) {
  const { getAccessToken } = usePrivy();
  const [destination, setDestination] = useState(campaign.destinationUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<CampaignAssetsResponse["assets"]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadAssets = useCallback(async () => {
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoadingAssets(true);

    try {
      const response = await authenticatedFetch<CampaignAssetsResponse>(
        getAccessToken,
        `/api/campaigns/${campaign.id}/assets`,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setAssets(response.assets);
      setLoadingAssets(false);
    } catch {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setAssets([]);
      setLoadingAssets(false);
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [campaign.id, getAccessToken]);

  useEffect(() => {
    void loadAssets();
    return cancelRequest;
  }, [loadAssets, cancelRequest]);

  const normalized = normalizeCampaignDestination(destination);
  const canContinue = Boolean(normalized) && !submitting;

  async function submit() {
    setError(null);

    if (!normalized) {
      setError(
        "Enter an http or https URL with a qualified hostname, such as brand.com.",
      );
      return;
    }

    try {
      await onContinue(normalized);
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not save the campaign artwork details.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">
            Scan destination
          </h2>
          <p className="text-[13px] text-muted">
            Where should someone land after scanning a poster?
          </p>
        </div>

        <label className="flex flex-col gap-1.5 px-6 py-5">
          <span className="text-[13px] font-medium text-muted">
            Destination URL
          </span>
          <input
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value);
              setError(null);
            }}
            placeholder="project.xyz/waitlist"
            className="w-full bg-transparent text-[17px] font-semibold outline-none"
          />
          {normalized && normalized !== destination.trim() ? (
            <span className="text-[12px] text-faint">
              Will be saved as {normalized}
            </span>
          ) : null}
          {error ? (
            <span className="text-[12px] text-fail">{error}</span>
          ) : null}
        </label>

        <p className="border-t border-line bg-surface px-6 py-3.5 text-[12.5px] leading-relaxed text-muted">
          You can change this later without reprinting. Every poster points at a
          StickerBomb short link that always resolves to your current
          destination.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">
            Campaign artwork
          </h2>
          <p className="text-[13px] text-muted">
            Each placement gets its own printable poster with a unique QR code.
          </p>
        </div>

        <div className="px-6 py-5">
          {loadingAssets ? (
            <div className="h-24 animate-pulse rounded-xl bg-raised" />
          ) : assets.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {assets.map((asset) => (
                <figure
                  key={asset.id}
                  className="overflow-hidden rounded-xl border border-line"
                >
                  <Image
                    src={asset.imageUrl}
                    alt={`Poster ${asset.sequence} for ${asset.location?.venueName ?? "an approved location"}`}
                    width={310}
                    height={438}
                    unoptimized
                    className="w-full bg-white"
                  />
                  <figcaption className="px-3 py-2.5">
                    <p className="truncate text-[12.5px] font-semibold">
                      Poster {asset.sequence} —{" "}
                      {asset.location?.venueName ?? "Approved location"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-faint">
                      {asset.shortCode}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-4 py-5">
              <p className="text-[13.5px] font-semibold">
                Posters are generated after funding
              </p>
              <p className="mt-1.5 max-w-[58ch] text-[12.5px] leading-relaxed text-muted">
                StickerBomb produces a high-contrast poster per placement and
                checks that every QR code reads back correctly before it can be
                printed.
              </p>
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
            Uploading your own artwork needs object storage, which is not
            configured yet. Until then StickerBomb produces the plain
            high-contrast poster that the print pack always includes.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-5">
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted">
            Next you will review the deterministic quote before anything is
            committed.
          </p>
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => void submit()}
            className="h-11 rounded-xl bg-solid px-5 text-[14.5px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? "Saving…" : "Review quote"}
          </button>
        </div>
      </Card>
    </div>
  );
}
