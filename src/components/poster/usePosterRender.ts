"use client";

import { useEffect, useRef, useState } from "react";
import type { PosterDesign } from "@/lib/assets/design";
import type { Rgba } from "@/lib/assets/halftone-core";
import type { ScanReport } from "@/lib/assets/scan-check";
import type {
  PosterWorkerRequest,
  PosterWorkerResponse,
} from "@/workers/poster.worker";

/** Same limit the server decodes artwork at (ARTWORK_SAMPLE_SIDE). */
const SAMPLE_SIDE = 1024;

/**
 * Stand-in scan URL for previews: identical shape and length to a real
 * poster's, so it encodes at the same QR version with the same module grid.
 */
export function previewPayload() {
  const origin = typeof window === "undefined" ? "https://stickerbomb.app" : window.location.origin;
  return `${origin}/s/PREVIEW234`;
}

async function loadArtwork(url: string): Promise<Rgba> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the artwork.");
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, data: context.getImageData(0, 0, width, height).data };
}

/**
 * Renders a poster design in a worker and reports whether it scans.
 * Latest request wins; stale results are dropped.
 */
export function usePosterRender(design: PosterDesign, artworkUrl: string | null, payload = previewPayload()) {
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const [result, setResult] = useState<PosterWorkerResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkVersion, setArtworkVersion] = useState(0);
  const pendingArtwork = useRef<Rgba | null | undefined>(undefined);

  useEffect(() => {
    // Bundled by esbuild into public/ (npm run build:worker, run before every
    // build and dev). Turbopack's production build copies a worker referenced
    // through import.meta.url as a raw .ts asset instead of compiling it.
    const instance = new Worker("/workers/poster.js", { type: "module" });
    instance.onmessage = (event: MessageEvent<PosterWorkerResponse>) => {
      if (event.data.id !== latest.current) return;
      setResult(event.data);
      setBusy(false);
    };
    worker.current = instance;
    return () => instance.terminate();
  }, []);

  // Artwork is decoded on the main thread (image decoding needs the DOM) and
  // handed to the worker once; later renders reuse it.
  useEffect(() => {
    let cancelled = false;
    setArtworkError(null);
    if (!artworkUrl) {
      pendingArtwork.current = null;
      setArtworkVersion((v) => v + 1);
      return;
    }
    loadArtwork(artworkUrl)
      .then((rgba) => {
        if (cancelled) return;
        pendingArtwork.current = rgba;
        setArtworkVersion((v) => v + 1);
      })
      .catch(() => {
        if (!cancelled) setArtworkError("Could not load your artwork for the preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  const designKey = JSON.stringify(design);
  useEffect(() => {
    if (artworkVersion === 0) return;
    setBusy(true);
    // A short settle so a dragged slider renders at its resting value, not
    // at every intermediate step.
    const timer = window.setTimeout(() => {
      const instance = worker.current;
      if (!instance) return;
      const id = ++latest.current;
      const request: PosterWorkerRequest = { id, payload, design: JSON.parse(designKey) };
      if (pendingArtwork.current !== undefined) {
        request.artwork = pendingArtwork.current;
        pendingArtwork.current = undefined;
      }
      instance.postMessage(request);
    }, 70);
    return () => window.clearTimeout(timer);
  }, [designKey, artworkVersion, payload]);

  return {
    image: result?.image ?? null,
    report: (result?.report ?? null) as ScanReport | null,
    block: result?.block ?? 5,
    busy,
    artworkError,
  };
}
