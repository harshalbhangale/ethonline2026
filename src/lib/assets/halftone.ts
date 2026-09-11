import sharp from "sharp";
import type { PosterDesign } from "@/lib/assets/design";
import {
  buildQr,
  QUIET_ZONE,
  renderPosterQr,
  type Rgba,
} from "@/lib/assets/halftone-core";
import { checkScan } from "@/lib/assets/scan-check";

/** Longest side artwork is decoded at, on both server and client. */
export const ARTWORK_SAMPLE_SIDE = 1024;

/** Decodes uploaded artwork to RGBA at the size the core samples from. */
export async function decodeArtwork(artwork: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(artwork)
    .rotate() // honour EXIF orientation, as the browser does
    .resize(ARTWORK_SAMPLE_SIDE, ARTWORK_SAMPLE_SIDE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

/**
 * Legibility steps tried after the brand's own choice. Each looks a little
 * less like the artwork and reads a little more easily.
 */
const LADDER_STEP = 0.1;
const LADDER_MAX = 0.9;

export type DesignedQr = {
  /** Native resolution: one pixel per subpixel, quiet zone included. */
  native: Rgba;
  /** The design actually used, after any automatic legibility increase. */
  design: PosterDesign;
  /** False when even the ladder failed and this is the plain fallback. */
  styled: boolean;
};

/**
 * The poster QR in the brand's design, proven printable.
 *
 * Starts at the brand's own legibility and only raises it if the render won't
 * read both close up and from a distance. If nothing on the ladder reads, it
 * falls back to the plain code in the same colour mode — an ugly poster that
 * scans beats a beautiful one that doesn't.
 */
export function renderPrintableQr(
  payload: string,
  artwork: Rgba | null,
  design: PosterDesign,
): DesignedQr {
  const qr = buildQr(payload);
  const across = qr.size + QUIET_ZONE * 2;

  if (design.style !== "PLAIN" && artwork) {
    for (
      let legibility = design.legibility;
      legibility <= LADDER_MAX + 1e-9;
      legibility += LADDER_STEP
    ) {
      const attempt = { ...design, legibility: Math.min(1, legibility) };
      const native = renderPosterQr(qr, artwork, attempt);
      if (checkScan(native, payload, across).printable) {
        return { native, design: attempt, styled: true };
      }
    }
  }

  const plain: PosterDesign = {
    ...design,
    style: "PLAIN",
    color: design.color === "BRAND" ? "BRAND" : "MONO",
  };
  const native = renderPosterQr(qr, null, plain);
  if (!checkScan(native, payload, across).printable) {
    throw new Error("Even the plain QR code failed to decode.");
  }
  return { native, design: plain, styled: false };
}

/** PNG of a native render, scaled to fit `size` with whole-pixel steps. */
export async function qrToPng(native: Rgba, size: number) {
  const factor = Math.max(1, Math.floor(size / native.width));
  const scaled = native.width * factor;
  const pad = Math.floor((size - scaled) / 2);

  return sharp(Buffer.from(native.data.buffer, native.data.byteOffset, native.data.byteLength), {
    raw: { width: native.width, height: native.height, channels: 4 },
  })
    // Nearest neighbour: smoothing would blur the module cores decoders rely on.
    .resize(scaled, scaled, { kernel: "nearest" })
    .extend({
      top: pad,
      left: pad,
      bottom: size - scaled - pad,
      right: size - scaled - pad,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}
