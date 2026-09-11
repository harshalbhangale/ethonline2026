import QRCode from "qrcode";
import type { PosterDesign } from "@/lib/assets/design";

/**
 * The poster QR renderer, shared by the browser studio and the print path.
 *
 * Pure TypeScript with no canvas or sharp, so the live preview and the
 * printed poster come from literally the same code. The technique follows
 * gentlecat/halftone-qr (MIT): each QR module becomes a block of subpixels;
 * the block's centre always carries the module's true value, because that is
 * where a decoder samples, and the surrounding subpixels carry the artwork.
 * Every structural pattern is drawn solid.
 */

export type Rgba = { width: number; height: number; data: Uint8ClampedArray };

export type QrMatrix = {
  size: number;
  /** 1 where the module is dark. */
  dark: Uint8Array;
  /**
   * 1 for every module a decoder needs intact to find and read the code at
   * all: finder patterns and separators, timing, every alignment pattern,
   * format and version information. Taken from the encoder itself rather
   * than hand-coded, so nothing is missed at any version.
   */
  reserved: Uint8Array;
};

/** Quiet zone, in modules. Phones struggle to lock on without it. */
export const QUIET_ZONE = 4;

/**
 * Version 10 is 57 modules: enough grid to carry an image, while each
 * printed module stays large enough to scan from a normal distance.
 */
export const POSTER_QR_VERSION = 10;

export function buildQr(payload: string, version = POSTER_QR_VERSION): QrMatrix {
  let qr: ReturnType<typeof QRCode.create>;
  try {
    qr = QRCode.create(payload, { errorCorrectionLevel: "H", version });
  } catch {
    // A payload too long for the requested version still gets a code.
    qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  }
  const modules = qr.modules as unknown as {
    size: number;
    data: Uint8Array;
    reservedBit: Uint8Array;
  };
  return {
    size: modules.size,
    dark: Uint8Array.from(modules.data),
    reserved: Uint8Array.from(modules.reservedBit),
  };
}

// ---------------------------------------------------------------------------
// Artwork sampling

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

type Sampled = { lum: Float32Array; rgb: Uint8ClampedArray };

/**
 * A square crop of the artwork, box-filtered down to n×n, with the design's
 * focus, zoom, brightness and contrast applied and the tonal range stretched
 * so a flat photo still halftones with depth.
 */
function sampleArtwork(src: Rgba, n: number, design: PosterDesign): Sampled {
  const side = Math.min(src.width, src.height) / design.zoom;
  const x0 = Math.min(Math.max(design.focusX * src.width - side / 2, 0), src.width - side);
  const y0 = Math.min(Math.max(design.focusY * src.height - side / 2, 0), src.height - side);
  const step = side / n;

  const rgb = new Uint8ClampedArray(n * n * 3);
  const lum = new Float32Array(n * n);

  for (let j = 0; j < n; j += 1) {
    const sy0 = Math.floor(y0 + j * step);
    const sy1 = Math.max(sy0 + 1, Math.min(src.height, Math.ceil(y0 + (j + 1) * step)));
    for (let i = 0; i < n; i += 1) {
      const sx0 = Math.floor(x0 + i * step);
      const sx1 = Math.max(sx0 + 1, Math.min(src.width, Math.ceil(x0 + (i + 1) * step)));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = sy0; y < sy1; y += 1) {
        for (let x = sx0; x < sx1; x += 1) {
          const o = (y * src.width + x) * 4;
          const alpha = src.data[o + 3] / 255;
          // Transparent areas read as white paper, not black.
          r += src.data[o] * alpha + 255 * (1 - alpha);
          g += src.data[o + 1] * alpha + 255 * (1 - alpha);
          b += src.data[o + 2] * alpha + 255 * (1 - alpha);
          count += 1;
        }
      }
      const p = j * n + i;
      rgb[p * 3] = r / count;
      rgb[p * 3 + 1] = g / count;
      rgb[p * 3 + 2] = b / count;
      lum[p] = luminance(r / count, g / count, b / count);
    }
  }

  // Stretch the 2nd–98th percentile to the full range.
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const span = Math.max(1, hi - lo);
  const gain = 1 + design.contrast;
  const lift = design.brightness * 96;

  for (let p = 0; p < lum.length; p += 1) {
    const stretched = ((lum[p] - lo) / span) * 255;
    lum[p] = Math.min(255, Math.max(0, (stretched - 128) * gain + 128 + lift));
  }

  return { lum, rgb };
}

// ---------------------------------------------------------------------------
// Dithering: target luminance in, dark bits out (1 = dark).

function ditherFloyd(target: Float32Array, n: number) {
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const p = y * n + x;
      const dark = target[p] < 128;
      out[p] = dark ? 1 : 0;
      const error = target[p] - (dark ? 0 : 255);
      if (x + 1 < n) target[p + 1] += (error * 7) / 16;
      if (y + 1 < n) {
        if (x > 0) target[p + n - 1] += (error * 3) / 16;
        target[p + n] += (error * 5) / 16;
        if (x + 1 < n) target[p + n + 1] += error / 16;
      }
    }
  }
  return out;
}

/** Atkinson: spreads only 3/4 of the error, so highlights and shadows stay clean. */
function ditherAtkinson(target: Float32Array, n: number) {
  const out = new Uint8Array(n * n);
  const spread: [number, number][] = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const p = y * n + x;
      const dark = target[p] < 128;
      out[p] = dark ? 1 : 0;
      const error = (target[p] - (dark ? 0 : 255)) / 8;
      for (const [dx, dy] of spread) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < n && ny < n) target[ny * n + nx] += error;
      }
    }
  }
  return out;
}

const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered 4×4 Bayer: a regular screen-print cross-hatch. */
function ditherBayer(target: Float32Array, n: number) {
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const threshold = ((bayer4[(y % 4) * 4 + (x % 4)] + 0.5) / 16) * 255;
      out[y * n + x] = target[y * n + x] < threshold ? 1 : 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Colour. Every dark pixel is set to one exact luminance and every light
// pixel to another: hue is free, brightness is not. Merely clamping ("dark
// enough", "light enough") is not sufficient — jsQR thresholds per small
// region, so a light area whose tints range 217–255 reads its dimmer pixels
// as dark. Measured: clamped colour failed the close-up read at every
// legibility; exact luminance passes like mono.

const DARK_LUMA = 30;
const LIGHT_LUMA = 232;

function atLuma(r: number, g: number, b: number, target: number): [number, number, number] {
  const l = luminance(r, g, b);
  if (l < 1) return [target, target, target];
  if (target <= l) {
    const k = target / l;
    return [r * k, g * k, b * k];
  }
  const t = (target - l) / Math.max(1, 255 - l);
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
}

const darken = (r: number, g: number, b: number) => atLuma(r, g, b, DARK_LUMA);
const lighten = (r: number, g: number, b: number) => atLuma(r, g, b, LIGHT_LUMA);

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// ---------------------------------------------------------------------------

/** Subpixels per module and the solid core each style uses. */
export function styleGeometry(design: PosterDesign) {
  if (design.style === "DOTS") return { block: 7, core: 3 };
  // A 3×3 core, always. A 1-pixel centre reads close up but vanishes once a
  // distant camera averages the block — measured: it never passed the
  // distance check at any legibility.
  if (design.style === "HALFTONE") return { block: 5, core: 3 };
  return { block: 5, core: 5 };
}

/**
 * Renders the QR at its native resolution: one pixel per subpixel, quiet zone
 * included. Callers scale it up with nearest-neighbour so edges stay hard.
 */
export function renderPosterQr(
  qr: QrMatrix,
  artwork: Rgba | null,
  design: PosterDesign,
): Rgba {
  const { block, core } = styleGeometry(design);
  const n = qr.size * block;
  const coreStart = (block - core) / 2;
  const bias = design.legibility;
  const useArtwork = artwork !== null && design.style !== "PLAIN";

  // bits[p] = 1 dark, over the n×n code area.
  const bits = new Uint8Array(n * n);
  let sampled: Sampled | null = null;

  if (useArtwork) {
    sampled = sampleArtwork(artwork, n, design);
    const target = new Float32Array(n * n);
    for (let y = 0; y < n; y += 1) {
      const row = Math.floor(y / block);
      for (let x = 0; x < n; x += 1) {
        const moduleValue = qr.dark[row * qr.size + Math.floor(x / block)] ? 0 : 255;
        target[y * n + x] = sampled.lum[y * n + x] * (1 - bias) + moduleValue * bias;
      }
    }

    if (design.style === "DOTS") {
      // Amplitude-modulated: one dot per module whose area tracks darkness.
      const centre = (block - 1) / 2;
      for (let row = 0; row < qr.size; row += 1) {
        for (let column = 0; column < qr.size; column += 1) {
          let sum = 0;
          for (let dy = 0; dy < block; dy += 1)
            for (let dx = 0; dx < block; dx += 1)
              sum += target[(row * block + dy) * n + column * block + dx];
          // The dot follows the artwork, but only within the half of the
          // range its module owns: a far-away camera averages the block, and
          // that average must still land on the module's side of grey.
          const tone = 1 - sum / (block * block * 255);
          const isDark = qr.dark[row * qr.size + column] === 1;
          const darkness = isDark ? 0.5 + tone * 0.5 : tone * 0.44;
          const radius = Math.sqrt(Math.max(0, darkness)) * block * 0.62;
          for (let dy = 0; dy < block; dy += 1)
            for (let dx = 0; dx < block; dx += 1)
              if (Math.hypot(dx - centre, dy - centre) <= radius)
                bits[(row * block + dy) * n + column * block + dx] = 1;
        }
      }
    } else {
      const dithered =
        design.dither === "ATKINSON"
          ? ditherAtkinson(target, n)
          : design.dither === "BAYER"
            ? ditherBayer(target, n)
            : ditherFloyd(target, n);
      bits.set(dithered);
    }
  }

  // Structure first: reserved modules solid, every module's core true.
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      const m = row * qr.size + column;
      const value = qr.dark[m] ? 1 : 0;
      const solid = !useArtwork || qr.reserved[m] === 1;
      for (let dy = 0; dy < block; dy += 1) {
        for (let dx = 0; dx < block; dx += 1) {
          const inCore =
            dx >= coreStart && dx < coreStart + core && dy >= coreStart && dy < coreStart + core;
          if (solid || inCore) bits[(row * block + dy) * n + column * block + dx] = value;
        }
      }
    }
  }

  // Paint, with the quiet zone around it.
  const pad = QUIET_ZONE * block;
  const size = n + pad * 2;
  const data = new Uint8ClampedArray(size * size * 4);
  const brand = design.color === "BRAND" ? darken(...hexToRgb(design.brandColor)) : null;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * 4;
      const cx = x - pad;
      const cy = y - pad;
      const inside = cx >= 0 && cy >= 0 && cx < n && cy < n;
      const dark = inside && bits[cy * n + cx] === 1;
      let r = 255;
      let g = 255;
      let b = 255;

      if (dark) {
        if (brand) [r, g, b] = brand;
        else if (design.color === "ARTWORK" && sampled) {
          const p = (cy * n + cx) * 3;
          [r, g, b] = darken(sampled.rgb[p], sampled.rgb[p + 1], sampled.rgb[p + 2]);
        } else [r, g, b] = [0, 0, 0];
      } else if (inside && design.color === "ARTWORK" && sampled) {
        const p = (cy * n + cx) * 3;
        [r, g, b] = lighten(sampled.rgb[p], sampled.rgb[p + 1], sampled.rgb[p + 2]);
      }

      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}

/** Nearest-neighbour upscale by an integer factor. */
export function scaleNearest(image: Rgba, factor: number): Rgba {
  const width = image.width * factor;
  const height = image.height * factor;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < width; x += 1) {
      const s = (sy * image.width + Math.floor(x / factor)) * 4;
      const o = (y * width + x) * 4;
      data[o] = image.data[s];
      data[o + 1] = image.data[s + 1];
      data[o + 2] = image.data[s + 2];
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}
