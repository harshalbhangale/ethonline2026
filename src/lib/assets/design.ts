import { z } from "zod";
import type { AssetTypeValue } from "@/lib/campaigns/types";

/**
 * How a campaign's poster QR is drawn. Browser-safe: the live studio and the
 * print renderer read the same object, so what the brand tunes is what prints.
 */

export const posterStyles = ["PLAIN", "HALFTONE", "DOTS"] as const;
export const posterColors = ["MONO", "ARTWORK", "BRAND"] as const;
export const posterDithers = ["FLOYD", "ATKINSON", "BAYER"] as const;

export type PosterStyle = (typeof posterStyles)[number];
export type PosterColor = (typeof posterColors)[number];
export type PosterDither = (typeof posterDithers)[number];

export type PosterDesign = {
  style: PosterStyle;
  color: PosterColor;
  /** Hex, used when color is BRAND. */
  brandColor: string;
  dither: PosterDither;
  /** 0 = pure artwork, 1 = plain code. Raised automatically if a render won't scan. */
  legibility: number;
  /** Where in the artwork the square crop is centred, 0..1. */
  focusX: number;
  focusY: number;
  /** 1 = the whole short side of the image, up to 3 = zoomed in. */
  zoom: number;
  /** -1..1 adjustments applied before halftoning. */
  brightness: number;
  contrast: number;
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const posterDesignSchema = z.object({
  style: z.enum(posterStyles),
  color: z.enum(posterColors),
  brandColor: hex,
  dither: z.enum(posterDithers),
  legibility: z.number().min(0).max(1),
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3),
  brightness: z.number().min(-1).max(1),
  contrast: z.number().min(-1).max(1),
});

export const styleLabels: Record<PosterStyle, { label: string; hint: string }> = {
  PLAIN: { label: "Plain", hint: "High-contrast code. Scans from furthest away." },
  HALFTONE: { label: "Halftone", hint: "Your artwork dithered through every module." },
  DOTS: { label: "Dots", hint: "Newsprint dots that grow with the image's shadows." },
};

export const colorLabels: Record<PosterColor, string> = {
  MONO: "Black & white",
  ARTWORK: "Artwork colours",
  BRAND: "Brand colour",
};

export const ditherLabels: Record<PosterDither, string> = {
  FLOYD: "Fine",
  ATKINSON: "Crisp",
  BAYER: "Pattern",
};

/**
 * What each asset tier unlocks. Normal is the plain code; Magic adds the
 * artwork styles in mono; Very Magic and NFC add colour.
 */
export function designAllowance(assetType: AssetTypeValue) {
  return {
    styles: assetType === "QR_NORMAL" ? (["PLAIN"] as PosterStyle[]) : [...posterStyles],
    colors:
      assetType === "QR_VERY_MAGIC" || assetType === "NFC"
        ? [...posterColors]
        : (["MONO"] as PosterColor[]),
  };
}

export function defaultDesign(assetType: AssetTypeValue, hasArtwork: boolean): PosterDesign {
  const colourful = assetType === "QR_VERY_MAGIC" || assetType === "NFC";
  return {
    style: assetType === "QR_NORMAL" || !hasArtwork ? "PLAIN" : "HALFTONE",
    color: colourful && hasArtwork ? "ARTWORK" : "MONO",
    brandColor: "#1d4ed8",
    dither: "FLOYD",
    legibility: 0.3,
    focusX: 0.5,
    focusY: 0.5,
    zoom: 1,
    brightness: 0,
    contrast: 0.1,
  };
}

/**
 * Clamps a stored or requested design to what the tier and artwork allow.
 * Enforced on the server too, so a design can never outrun what was paid for.
 */
export function resolveDesign(
  raw: unknown,
  assetType: AssetTypeValue,
  hasArtwork: boolean,
): PosterDesign {
  const fallback = defaultDesign(assetType, hasArtwork);
  const parsed = posterDesignSchema.safeParse(raw);
  const design = parsed.success ? parsed.data : fallback;
  const allowed = designAllowance(assetType);

  let style = allowed.styles.includes(design.style) ? design.style : "PLAIN";
  // The artwork styles have nothing to draw without artwork.
  if (!hasArtwork) style = "PLAIN";
  let color = allowed.colors.includes(design.color) ? design.color : "MONO";
  if (color === "ARTWORK" && !hasArtwork) color = "MONO";

  return { ...design, style, color };
}

/**
 * The colour a poster's headline and frame are printed in: the brand colour
 * when it is dark enough to read on white paper, black otherwise. (The QR
 * itself never needs this — the renderer pins dark modules to a fixed
 * luminance whatever the hue.)
 */
export function posterInk(design: PosterDesign) {
  if (design.color !== "BRAND") return "#0B0B0C";
  const value = Number.parseInt(design.brandColor.slice(1), 16);
  const luma = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  return luma < 140 ? design.brandColor : "#0B0B0C";
}
