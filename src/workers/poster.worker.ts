/// <reference lib="webworker" />
import type { PosterDesign } from "@/lib/assets/design";
import { buildQr, QUIET_ZONE, renderPosterQr, type Rgba } from "@/lib/assets/halftone-core";
import { checkScan, type ScanReport } from "@/lib/assets/scan-check";

/**
 * Renders the studio preview off the main thread with the exact core the
 * print path uses, and runs the same street-conditions scan check, so
 * dragging a slider never stalls the page.
 */

export type PosterWorkerRequest = {
  id: number;
  payload: string;
  design: PosterDesign;
  /** Sent once per artwork change; omitted to reuse the cached one. */
  artwork?: Rgba | null;
};

export type PosterWorkerResponse = {
  id: number;
  image: Rgba;
  report: ScanReport;
  block: number;
};

let artwork: Rgba | null = null;

self.onmessage = (event: MessageEvent<PosterWorkerRequest>) => {
  const { id, payload, design } = event.data;
  if (event.data.artwork !== undefined) artwork = event.data.artwork;

  const qr = buildQr(payload);
  const image = renderPosterQr(qr, artwork, design);
  const report = checkScan(image, payload, qr.size + QUIET_ZONE * 2);
  const response: PosterWorkerResponse = {
    id,
    image,
    report,
    block: image.width / (qr.size + QUIET_ZONE * 2),
  };
  (self as unknown as Worker).postMessage(response, [image.data.buffer]);
};
