import jsQRImport from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { renderHalftoneQrPng } from "@/lib/assets/halftone";

// jsqr is CommonJS and exposes the function both directly and as `.default`,
// which interop resolves differently depending on the bundler.
const jsQR = (
  typeof jsQRImport === "function"
    ? jsQRImport
    : (jsQRImport as { default: typeof jsQRImport }).default
) as typeof jsQRImport;

/**
 * QR settings tuned for physical scanning rather than looks.
 *
 * High error correction survives scuffs and rain, and the quiet zone must stay
 * generous or phones fail to lock on from a distance.
 */
const qrOptions = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
  width: 900,
  color: { dark: "#000000", light: "#FFFFFF" },
};

const posterWidth = 1_240;
const posterHeight = 1_754; // A-series proportions at print-friendly density.

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function renderQrPng(payload: string) {
  return QRCode.toBuffer(payload, { ...qrOptions, type: "png" });
}

export type QrStyle = "HALFTONE" | "PLAIN";

/**
 * Increasing fidelity to the plain code. Each step looks a little less like the
 * artwork and decodes a little more easily.
 */
const halftoneLadder = [0.2, 0.35, 0.5, 0.7];

/**
 * The brand's artwork woven into the code, but never at the cost of scanning.
 *
 * Every candidate is decoded before it is accepted, the bias climbs until one
 * reads, and a plain high-contrast code is always the floor. A poster that
 * cannot be scanned is worth less than an ugly one.
 */
export async function renderScannableQrPng(
  payload: string,
  artwork: Buffer | null,
): Promise<{ png: Buffer; style: QrStyle }> {
  if (artwork) {
    for (const bias of halftoneLadder) {
      try {
        const png = await renderHalftoneQrPng({ payload, artwork, bias });
        const { matches } = await verifyQrPayload(png, payload);
        if (matches) return { png, style: "HALFTONE" };
      } catch (error) {
        console.error("Halftone QR rendering failed", error);
        break;
      }
    }
  }

  return { png: await renderQrPng(payload), style: "PLAIN" };
}

/**
 * The printable poster.
 *
 * With artwork it carries a halftone code that looks like the brand; without
 * it, the plain high-contrast code the print pack must always be able to fall
 * back to. Either way the QR is decoded before this returns.
 */
export async function renderPosterPng({
  payload,
  headline,
  venueName,
  shortCode,
  artwork = null,
}: {
  payload: string;
  headline: string;
  venueName: string;
  shortCode: string;
  artwork?: Buffer | null;
}) {
  const { png: qrPng, style } = await renderScannableQrPng(payload, artwork);
  const qrSize = 820;
  const qrX = Math.round((posterWidth - qrSize) / 2);
  const qrY = 380;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${posterWidth}" height="${posterHeight}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  <text x="${posterWidth / 2}" y="190" text-anchor="middle"
    font-family="Helvetica, Arial, sans-serif" font-size="74" font-weight="700" fill="#0B0B0C">
    ${escapeXml(headline)}
  </text>
  <text x="${posterWidth / 2}" y="264" text-anchor="middle"
    font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#4A4A4F">
    Scan to open
  </text>
  <rect x="${qrX - 24}" y="${qrY - 24}" width="${qrSize + 48}" height="${qrSize + 48}" rx="28" fill="#FFFFFF" stroke="#0B0B0C" stroke-width="4"/>
  <text x="${posterWidth / 2}" y="${qrY + qrSize + 140}" text-anchor="middle"
    font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="600" fill="#0B0B0C">
    ${escapeXml(venueName)}
  </text>
  <text x="${posterWidth / 2}" y="${qrY + qrSize + 202}" text-anchor="middle"
    font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#6B6B72" letter-spacing="6">
    ${escapeXml(shortCode)}
  </text>
  <text x="${posterWidth / 2}" y="${posterHeight - 70}" text-anchor="middle"
    font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#8A8A90">
    Placed with permission · StickerBomb
  </text>
</svg>`;

  // Nearest neighbour so module edges stay hard at the poster's scale.
  const scaled = await sharp(qrPng)
    .resize(qrSize, qrSize, { kernel: "nearest" })
    .toBuffer();

  const png = await sharp(Buffer.from(svg))
    .composite([{ input: scaled, top: qrY, left: qrX }])
    .png()
    .toBuffer();

  return { png, style };
}

/**
 * Decodes a rendered asset with an independent decoder.
 *
 * `qrcode` encoding succeeding does not prove a phone can read the result, so
 * every asset is round-tripped through jsQR before it is marked ready. A poster
 * that cannot be decoded must never reach a printer.
 */
export async function verifyQrPayload(png: Buffer, expectedPayload: string) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const decoded = jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
  );

  return {
    decoded: decoded?.data ?? null,
    matches: decoded?.data === expectedPayload,
  };
}
