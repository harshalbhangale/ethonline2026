"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import type { CampaignAssetDto, CampaignAssetsResponse } from "@/lib/assets/types";

type Loaded = { asset: CampaignAssetDto; url: string | null; failed: boolean };

/**
 * Every printable poster for a funded campaign, rendered by the print path
 * itself. The image route needs the brand's token, so an <img src> can't load
 * it directly: each poster is fetched with the token and shown from a blob.
 */
export default function PosterGallery({ campaignId }: { campaignId: string }) {
  const { getAccessToken } = usePrivy();
  const [items, setItems] = useState<Loaded[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      const { assets } = await authenticatedFetch<CampaignAssetsResponse>(
        getAccessToken,
        `/api/campaigns/${campaignId}/assets`,
      );
      if (cancelled) return;
      setItems(assets.map((asset) => ({ asset, url: null, failed: false })));

      const token = await getAccessToken();
      // A few at a time: each is rendered and scan-checked on the server.
      const queue = [...assets];
      const worker = async () => {
        for (let asset = queue.shift(); asset; asset = queue.shift()) {
          try {
            const response = await fetch(asset.imageUrl, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error(String(response.status));
            const url = URL.createObjectURL(await response.blob());
            urls.push(url);
            if (cancelled) return;
            setItems((current) =>
              current?.map((item) => (item.asset.id === asset!.id ? { ...item, url } : item)) ?? null,
            );
          } catch {
            if (cancelled) return;
            setItems((current) =>
              current?.map((item) => (item.asset.id === asset!.id ? { ...item, failed: true } : item)) ?? null,
            );
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    })().catch(() => {
      if (!cancelled) setItems([]);
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [campaignId, getAccessToken]);

  if (items !== null && items.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-6 py-4">
        <h2 className="text-[16px] font-bold">Printable posters</h2>
        <p className="text-[12.5px] text-muted">
          One per venue, each with its own code, each decoded before it could print.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4">
        {(items ?? Array.from({ length: 4 }, () => null)).map((item, index) => (
          <figure key={item?.asset.id ?? index} className="group overflow-hidden rounded-xl border border-line bg-surface">
            <div className="relative aspect-[1240/1754] bg-white">
              <AnimatePresence>
                {item?.url ? (
                  <motion.img
                    src={item.url}
                    alt={`Poster ${item.asset.sequence}`}
                    initial={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : item?.failed ? (
                  <div className="absolute inset-0 grid place-items-center text-[11.5px] text-[#8A8A90]">
                    Could not render
                  </div>
                ) : (
                  <div className="absolute inset-0 animate-pulse bg-[#eceae6]" />
                )}
              </AnimatePresence>
            </div>
            <figcaption className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold">
                  {item?.asset.location?.venueName ?? "…"}
                </span>
                <span className="block font-mono text-[11px] text-faint">{item?.asset.shortCode ?? ""}</span>
              </span>
              {item?.url ? (
                <a
                  href={item.url}
                  download={`stickerbomb-${item.asset.shortCode}.png`}
                  aria-label={`Download poster ${item.asset.shortCode}`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-ink active:scale-95"
                >
                  <DownloadSimpleIcon size={14} weight="bold" />
                </a>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}
