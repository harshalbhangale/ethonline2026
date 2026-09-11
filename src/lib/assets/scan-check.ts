import jsQRImport from "jsqr";
import { scaleNearest, type Rgba } from "@/lib/assets/halftone-core";

// jsqr is CommonJS and exposes the function both directly and as `.default`.
const jsQR = (
  typeof jsQRImport === "function"
    ? jsQRImport
    : (jsQRImport as { default: typeof jsQRImport }).default
) as typeof jsQRImport;

/** Box-filter downscale to a target width: what a far-away camera sees. */
function downsample(image: Rgba, width: number): Rgba {
  const ratio = image.width / width;
  const height = Math.round(image.height / ratio);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy0 = Math.floor(y * ratio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * ratio));
    for (let x = 0; x < width; x += 1) {
      const sx0 = Math.floor(x * ratio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * ratio));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        for (let sx = sx0; sx < sx1; sx += 1) {
          const s = (sy * image.width + sx) * 4;
          r += image.data[s];
          g += image.data[s + 1];
          b += image.data[s + 2];
          count += 1;
        }
      }
      const o = (y * width + x) * 4;
      data[o] = r / count;
      data[o + 1] = g / count;
      data[o + 2] = b / count;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Separable box blur: a slightly out-of-focus camera. */
function blur(image: Rgba, radius: number): Rgba {
  const { width, height } = image;
  const pass = (src: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
          const s = (sy * width + sx) * 4;
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          count += 1;
        }
        const o = (y * width + x) * 4;
        out[o] = r / count;
        out[o + 1] = g / count;
        out[o + 2] = b / count;
        out[o + 3] = 255;
      }
    }
    return out;
  };
  return { width, height, data: pass(pass(image.data, true), false) };
}

function reads(image: Rgba, payload: string) {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
  return result?.data === payload;
}

export type ScanReport = {
  /** Read at full resolution. */
  close: boolean;
  /** Read at ~4px per module, subpixels averaged together. */
  distance: boolean;
  /** Read slightly out of focus. */
  blurred: boolean;
  /** 0–3: how many conditions it survives. */
  score: number;
  /** What printing requires: close up and from a distance. */
  printable: boolean;
};

/**
 * Decodes a native-resolution render under the conditions a phone meets on a
 * street, with an independent decoder. The same function gates printing on the
 * server and drives the confidence meter in the studio.
 */
export function checkScan(native: Rgba, payload: string, modulesAcross: number): ScanReport {
  const closeImage = scaleNearest(native, Math.max(1, Math.ceil(900 / native.width)));
  const close = reads(closeImage, payload);
  const distance = reads(downsample(native, modulesAcross * 4), payload);
  const blurred = reads(blur(downsample(closeImage, 600), 2), payload);
  const score = Number(close) + Number(distance) + Number(blurred);
  return { close, distance, blurred, score, printable: close && distance };
}
