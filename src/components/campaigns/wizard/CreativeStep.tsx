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

type ArtworkResponse = {
  path: string | null;
  artworkHash: string | null;
  viewUrl: string | null;
};

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
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const artworkInput = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;

    void authenticatedFetch<ArtworkResponse>(
      getAccessToken,
      `/api/campaigns/${campaign.id}/artwork`,
    )
      .then((response) => {
        if (!cancelled) setArtworkUrl(response.viewUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [campaign.id, getAccessToken]);

  async function uploadArtwork(file: File) {
    setUploading(true);
    setArtworkError(null);

    try {
      const { signedUrl, path } = await authenticatedFetch<{
        signedUrl: string;
        path: string;
      }>(getAccessToken, `/api/campaigns/${campaign.id}/artwork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload-url", contentType: file.type }),
      });

      const upload = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("Upload failed.");

      const saved = await authenticatedFetch<ArtworkResponse>(
        getAccessToken,
        `/api/campaigns/${campaign.id}/artwork`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", path }),
        },
      );

      setArtworkUrl(saved.viewUrl);
    } catch (caught) {
      setArtworkError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not upload that image. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  const normalized = normalizeCampaignDestination(destination);
  const canContinue = Boolean(normalized) && !submitting;
  // Read from the browser so the tag is correct in every environment.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

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

        <div className="border-t border-line px-6 py-5">
          <p className="text-[13.5px] font-semibold">Measure what happens next</p>
          <p className="mt-1.5 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
            Scans are counted for you. Add this tag to your site and each arrival
            and signup is traced back to the exact poster that caused it.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed">
            {`<script src="${origin}/sb.js" async></script>`}
          </pre>
          <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
            Call <code className="font-mono">stickerbomb(&quot;signup&quot;)</code>{" "}
            at your own conversion point. Repeat reports of the same event are
            ignored, so a reload cannot inflate the numbers.
          </p>
        </div>
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

          <div className="mt-5 border-t border-line pt-5">
            <input
              ref={artworkInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadArtwork(file);
              }}
            />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[52ch]">
                <p className="text-[13.5px] font-semibold">Your image</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Upload artwork and the QR is woven into it as a halftone, so
                  the poster looks like your brand rather than a barcode. Every
                  poster is still decoded before it can be printed, and falls
                  back to the plain high-contrast version if it does not read.
                </p>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => artworkInput.current?.click()}
                className="h-10 shrink-0 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised disabled:opacity-50"
              >
                {uploading
                  ? "Uploading…"
                  : artworkUrl
                    ? "Replace image"
                    : "Upload image"}
              </button>
            </div>

            {artworkUrl ? (
              <Image
                src={artworkUrl}
                alt="Campaign artwork"
                width={280}
                height={280}
                unoptimized
                className="mt-4 h-40 w-auto rounded-xl border border-line object-contain"
              />
            ) : null}

            {artworkError ? (
              <p className="mt-3 text-[12.5px] text-fail">{artworkError}</p>
            ) : null}
          </div>
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
