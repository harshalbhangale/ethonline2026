"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Rgba } from "@/lib/assets/halftone-core";

const DEVELOP_MS = 900;

/** Deterministic per-block order, so the image resolves in a scattered wave. */
function blockRank(bx: number, by: number) {
  let h = (bx * 374761393 + by * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Draws a native-resolution poster render, pixel-sharp at any size.
 *
 * When `developKey` changes, the new render "develops" like a print: blocks
 * resolve out of static in a scattered wave, centre-weighted, rather than
 * the image simply swapping. Slider tweaks with the same key update in place.
 */
export default function PosterCanvas({
  image,
  developKey,
  block,
  className,
}: {
  image: Rgba | null;
  developKey: string;
  block: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shownKey = useRef<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = canvas.current;
    if (!node || !image) return;
    node.width = image.width;
    node.height = image.height;
    const context = node.getContext("2d");
    if (!context) return;

    const final = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    const develop = !reduce && shownKey.current !== developKey;
    shownKey.current = developKey;

    if (!develop) {
      context.putImageData(final, 0, 0);
      return;
    }

    const frame = new ImageData(image.width, image.height);
    const blocks = Math.ceil(image.width / block);
    const centre = blocks / 2;
    let raf = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const t = Math.min(1, (now - started) / DEVELOP_MS);
      const eased = 1 - (1 - t) ** 3;
      for (let y = 0; y < image.height; y += 1) {
        const by = Math.floor(y / block);
        for (let x = 0; x < image.width; x += 1) {
          const bx = Math.floor(x / block);
          // Centre blocks develop first, edges last, with a scatter on top.
          const distance = Math.hypot(bx - centre, by - centre) / (centre * 1.42);
          const threshold = distance * 0.55 + blockRank(bx, by) * 0.45;
          const o = (y * image.width + x) * 4;
          if (eased >= threshold) {
            frame.data[o] = final.data[o];
            frame.data[o + 1] = final.data[o + 1];
            frame.data[o + 2] = final.data[o + 2];
          } else {
            const v = Math.random() < 0.5 ? 28 : 64;
            frame.data[o] = v;
            frame.data[o + 1] = v;
            frame.data[o + 2] = v;
          }
          frame.data[o + 3] = 255;
        }
      }
      context.putImageData(frame, 0, 0);
      if (t < 1) raf = requestAnimationFrame(draw);
      else context.putImageData(final, 0, 0);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [image, developKey, block, reduce]);

  return (
    <canvas
      ref={canvas}
      className={className}
      style={{ imageRendering: "pixelated" }}
      aria-label="Poster QR preview"
      role="img"
    />
  );
}
