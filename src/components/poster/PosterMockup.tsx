"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import PosterCanvas from "@/components/poster/PosterCanvas";
import { usePosterRender } from "@/components/poster/usePosterRender";
import { posterInk, type PosterDesign } from "@/lib/assets/design";

const TILT = { stiffness: 160, damping: 20, mass: 0.6 };

/**
 * The campaign's poster as it will look pasted on a wall: same renderer as
 * the print path, framed like the printed sheet, and tilting gently toward
 * the pointer so it reads as a physical object rather than a thumbnail.
 */
export default function PosterMockup({
  design,
  artworkUrl,
  headline,
}: {
  design: PosterDesign;
  artworkUrl: string | null;
  headline: string;
}) {
  const { image, block, report } = usePosterRender(design, artworkUrl);
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), TILT);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), TILT);
  const glareX = useTransform(px, [-0.5, 0.5], ["20%", "80%"]);
  const glare = useTransform(
    glareX,
    (x) => `linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.55) ${x}, transparent 70%)`,
  );

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  const ink = posterInk(design);

  return (
    <div
      onPointerMove={onMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-line px-6 py-10"
      style={{
        perspective: 1100,
        background:
          "radial-gradient(120% 90% at 50% 20%, #3a3a3d 0%, #1f1f21 55%, #121213 100%)",
      }}
    >
      {/* Concrete grain on the wall. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/textures/plastic-noise.svg')] bg-[length:180px_180px] opacity-40 mix-blend-overlay"
      />

      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        initial={reduce ? false : { opacity: 0, y: 18, rotateZ: -2 }}
        animate={{ opacity: 1, y: 0, rotateZ: -0.8 }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="relative w-[230px] shrink-0 bg-white px-5 pt-6 pb-5 text-center shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),0_10px_20px_-10px_rgba(0,0,0,0.6)]"
      >
        <p className="truncate text-[15px] font-bold" style={{ color: ink }}>
          {headline}
        </p>
        <p className="mt-0.5 text-[9.5px] text-[#4A4A4F]">Scan to open</p>
        <div className="mt-3 border-2 p-1.5" style={{ borderColor: ink, borderRadius: 8 }}>
          {image ? (
            <PosterCanvas image={image} block={block} developKey="mockup" className="block aspect-square w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-[#eee]" />
          )}
        </div>
        <p className="mt-3 text-[10px] font-semibold text-[#0B0B0C]">Your approved venue</p>
        <p className="mt-0.5 font-mono text-[8.5px] tracking-[0.2em] text-[#6B6B72]">ABCD2345XY</p>
        <p className="mt-3 text-[7.5px] text-[#8A8A90]">Placed with permission · StickerBomb</p>

        {/* A soft light sweep that follows the tilt. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{ background: glare }}
        />
        {/* Tape. */}
        <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rotate-[-3deg] bg-[#e9e4d4]/80 shadow-sm" />
      </motion.div>

      {report ? (
        <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-semibold text-white/85 backdrop-blur">
          {report.printable ? "Scan-checked" : "Legibility will be raised for print"}
        </span>
      ) : null}
    </div>
  );
}
