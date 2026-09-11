/**
 * Proves every poster design prints a code that scans, on hostile artwork.
 *
 * Renders each style × colour × dither against a corpus of images chosen to
 * break halftoning (solid black, solid white, noise, fine stripes, low
 * contrast, transparency, a real photo), at the worst-case legibility of 0,
 * through the same ladder the print path uses — then decodes the finished
 * poster independently.
 *
 *   node scripts/run-ts.cjs scripts/test-poster-qr.ts
 */
import sharp from "sharp";
import {
  defaultDesign,
  posterColors,
  posterDithers,
  posterStyles,
  type PosterDesign,
} from "@/lib/assets/design";
import { decodeArtwork, renderPrintableQr } from "@/lib/assets/halftone";
import type { Rgba } from "@/lib/assets/halftone-core";
import { renderPosterPng, verifyQrPayload } from "@/lib/assets/qr";

function synthetic(name: string, pixel: (x: number, y: number) => [number, number, number, number]): [string, Rgba] {
  const size = 512;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) data.set(pixel(x, y), (y * size + x) * 4);
  return [name, { width: size, height: size, data }];
}

let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const corpus: [string, Rgba][] = [
  ["photo", await decodeArtwork(await sharp("src/assets/banner.jpg").toBuffer())],
  ["transparent logo", await decodeArtwork(await sharp("public/logo_remove.png").toBuffer())],
  synthetic("black", () => [0, 0, 0, 255]),
  synthetic("white", () => [255, 255, 255, 255]),
  synthetic("noise", () => { const v = random() * 255; return [v, random() * 255, v, 255]; }),
  synthetic("stripes", (x) => (x % 4 < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
  synthetic("low contrast", (x) => { const v = 118 + (x / 512) * 20; return [v, v, v, 255]; }),
  synthetic("saturated", (x, y) => [(x * 255) / 512, 40, (y * 255) / 512, 255]),
];

const payloads = ["ABCDEFGHJK", "ZZZZZZZZZZ", "23456789AB"].map((code) => `https://ethonline2026.vercel.app/s/${code}`);

let failures = 0;
let runs = 0;
const fellBack: string[] = [];
const legibility: number[] = [];

for (const [name, artwork] of corpus) {
  for (const style of posterStyles) {
    for (const color of posterColors) {
      for (const dither of style === "HALFTONE" ? posterDithers : (["FLOYD"] as const)) {
        const design: PosterDesign = { ...defaultDesign("NFC", true), style, color, dither, legibility: 0 };
        for (const payload of payloads) {
          runs += 1;
          const label = `${name} / ${style} / ${color} / ${dither}`;
          try {
            const printed = renderPrintableQr(payload, artwork, design);
            if (!printed.styled && style !== "PLAIN") fellBack.push(label);
            else if (style !== "PLAIN") legibility.push(printed.design.legibility);
            if (payload === payloads[0]) {
              const { png } = await renderPosterPng({ payload, headline: "Test", venueName: "Venue", shortCode: "ABCDEFGHJK", artwork, design });
              if (!(await verifyQrPayload(png, payload)).matches) throw new Error("finished poster did not decode");
            }
          } catch (error) {
            failures += 1;
            console.log("FAIL", label, (error as Error).message);
          }
        }
      }
    }
  }
}

const average = legibility.reduce((a, b) => a + b, 0) / Math.max(1, legibility.length);
console.log(`${runs} renders, ${failures} failed to print a readable code`);
console.log(`styled renders needed legibility ${average.toFixed(2)} on average (max ${Math.max(...legibility).toFixed(1)})`);
console.log(`${fellBack.length} fell back to plain${fellBack.length ? ":\n  " + [...new Set(fellBack)].join("\n  ") : ""}`);
process.exit(failures ? 1 : 0);
