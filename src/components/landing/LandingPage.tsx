"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import banner from "@/assets/banner.jpg";

/** Staggered reveal shared by every section below the fold. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Mark() {
  return (
    <Image
      src="/logo_remove.png"
      alt="StickerBomb"
      width={220}
      height={132}
      priority
      className="h-9 w-auto object-contain"
    />
  );
}

/** A QR glyph drawn as a grid, so no image request is needed. */
function QrGlyph({ className = "" }: { className?: string }) {
  // A fixed pattern: readable as a QR at a glance without pretending to scan.
  const cells = [
    "1110111011101110",
    "1000101010001010",
    "1011100010111000",
    "1000101110001011",
    "1110001011100010",
    "0001110100011101",
    "1101000111010001",
    "0010111000101110",
    "1110001011100010",
    "1000111010001110",
    "1011101010111010",
    "1000100010001000",
    "1110111011101110",
    "0101000101010001",
    "1010111010101110",
    "1110001011100010",
  ];

  return (
    <div
      className={`grid aspect-square w-full gap-[2px] ${className}`}
      style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
      aria-hidden
    >
      {cells.flatMap((row, y) =>
        row.split("").map((cell, x) => (
          <span
            key={`${y}-${x}`}
            className="aspect-square rounded-[1px]"
            style={{ background: cell === "1" ? "currentColor" : "transparent" }}
          />
        )),
      )}
    </div>
  );
}

/** A poster pinned inside corner brackets: "a surface, claimed". */
function SurfaceMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8">
      <path d="M2 9V4a2 2 0 0 1 2-2h5M30 9V4a2 2 0 0 0-2-2h-5M2 23v5a2 2 0 0 0 2 2h5M30 23v5a2 2 0 0 1-2 2h-5"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="9.5" y="9.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-extrabold leading-none tracking-[-0.03em] fluid-stat">
        {value}
      </div>
      <div className="mt-2 text-[13px] leading-snug text-muted">{label}</div>
    </div>
  );
}

const steps = [
  { n: "01", title: "Write the brief", body: "One sentence. Get a costed plan back." },
  { n: "02", title: "Fund escrow", body: "Budget locked onchain before anything prints." },
  { n: "03", title: "Posters go up", body: "Workers claim jobs, capture GPS and photo proof." },
  { n: "04", title: "Proof clears", body: "Spot-checked, then escrow pays out." },
];

const surfaces = [
  "Bus stops",
  "Shop shutters",
  "Cafe windows",
  "Campus boards",
];

export default function LandingPage({
  onSignIn,
  signInLabel,
  signInDisabled = false,
}: {
  onSignIn: () => void;
  signInLabel: string;
  signInDisabled?: boolean;
}) {
  const reduce = useReducedMotion();

  return (
    <main className="min-h-screen overflow-x-hidden bg-bg">
      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[17px] font-extrabold tracking-[-0.03em]">
              StickerBomb
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/worker"
              className="hidden h-10 items-center rounded-xl px-4 text-[14px] font-semibold text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              Worker portal
            </Link>
            <button
              onClick={onSignIn}
              disabled={signInDisabled}
              className="inline-flex h-10 items-center rounded-xl bg-solid px-4 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {signInLabel}
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative">
        {/* Amber wash behind the headline. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{
            background:
              "radial-gradient(60% 70% at 50% 0%, color-mix(in srgb, var(--badge) 16%, transparent) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-[1180px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
            className="mx-auto max-w-[820px] text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-badge/40 bg-badge/5 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-badge opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-badge" />
              </span>
              Verified physical advertising
            </span>

            <h1 className="mt-6 font-extrabold leading-[1.0] tracking-[-0.045em] fluid-h1">
              Posters on the street.
              <br />
              <span className="text-badge">Proof on the chain.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-[56ch] leading-relaxed text-muted fluid-lead">
              Run a physical campaign from one sentence. Workers place it,
              proof clears, escrow pays out.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 min-[480px]:flex-row">
              <button
                onClick={onSignIn}
                disabled={signInDisabled}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-solid px-6 text-[15px] font-bold text-solid-ink transition-opacity hover:opacity-90 disabled:opacity-60 min-[480px]:w-auto"
              >
                {signInLabel}
              </button>
              <Link
                href="/worker"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-6 text-[15px] font-semibold transition-colors hover:bg-raised min-[480px]:w-auto"
              >
                Earn putting up posters
              </Link>
            </div>
          </motion.div>

          {/* Hero image: the crowd scanning the QR poster. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 34 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="relative mx-auto mt-14 max-w-[1000px]"
          >
            <div className="relative overflow-hidden rounded-[26px] border border-line bg-surface shadow-2xl">
              <Image
                src={banner}
                alt="A crowd on the street scanning the QR code on a StickerBomb poster"
                priority
                sizes="(max-width: 1000px) 100vw, 1000px"
                className="h-[300px] w-full object-cover object-center sm:h-[440px] lg:h-[520px]"
              />
              {/* Bottom fade so the floating card reads cleanly. */}
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-32"
                style={{
                  background:
                    "linear-gradient(to top, var(--bg) 0%, transparent 100%)",
                }}
              />
            </div>

            {/* Live-scan card pinned to the image corner. */}
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.94 }}
              animate={reduce ? undefined : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="absolute -bottom-5 right-4 hidden items-center gap-3 rounded-2xl border border-line bg-raised/95 px-4 py-3 backdrop-blur-xl sm:flex lg:right-8"
            >
              <div className="h-11 w-11 shrink-0 text-ink">
                <QrGlyph />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-paid" />
                  Placement verified
                </div>
                <div className="text-[12px] text-muted">
                  Escrow released to 2 wallets
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Stat strip. */}
          <Reveal delay={0.1}>
            <div className="mx-auto mt-20 grid max-w-[900px] grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-10 sm:grid-cols-4">
              <Stat value="45 min" label="Brief to street" />
              <Stat value="2-person" label="Proof per placement" />
              <Stat value="100%" label="Escrowed up front" />
              <Stat value="Per-QR" label="Scans per poster" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Surfaces ---------------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
        <Reveal>
          <h2 className="max-w-[20ch] font-extrabold leading-[1.07] tracking-[-0.04em] fluid-h2">
            Every surface is ad space.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
          {surfaces.map((surface, i) => (
            <Reveal key={surface} delay={i * 0.07}>
              <div className="group flex h-full items-center gap-3.5 rounded-[20px] border border-line bg-surface p-5 transition-colors hover:border-badge/40">
                <div className="shrink-0 text-badge/70 transition-colors group-hover:text-badge">
                  <SurfaceMark />
                </div>
                <h3 className="text-[16px] font-bold tracking-[-0.02em]">
                  {surface}
                </h3>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
          <Reveal>
            <h2 className="max-w-[22ch] font-extrabold leading-[1.07] tracking-[-0.04em] fluid-h2">
              How it works.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-px overflow-hidden rounded-[22px] border border-line bg-line min-[560px]:grid-cols-2">
            {steps.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.06}>
                <div className="h-full bg-bg p-7 sm:p-9">
                  <span className="text-[13px] font-extrabold tracking-[0.08em] text-badge">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-[20px] font-bold tracking-[-0.025em]">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Two portals ---------------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8">
        <Reveal>
          <h2 className="max-w-[20ch] font-extrabold leading-[1.07] tracking-[-0.04em] fluid-h2">
            Two ways in.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col rounded-[24px] border border-line panel p-8 sm:p-10">
              <span className="inline-flex w-fit rounded-full border border-badge/40 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">
                For brands
              </span>
              <h3 className="mt-5 text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em]">
                Campaigns you can audit.
              </h3>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Every placement on a map, with photo proof and its own scan count.
              </p>
              <button
                onClick={onSignIn}
                disabled={signInDisabled}
                className="mt-8 inline-flex h-12 w-fit items-center rounded-xl bg-solid px-6 text-[15px] font-bold text-solid-ink transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {signInLabel}
              </button>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="flex h-full flex-col rounded-[24px] border border-line bg-surface p-8 sm:p-10">
              <span className="inline-flex w-fit rounded-full border border-line px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">
                For workers
              </span>
              <h3 className="mt-5 text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em]">
                Put up posters. Get paid.
              </h3>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Jobs near you, paid from escrow that was funded up front.
              </p>
              <Link
                href="/worker"
                className="mt-8 inline-flex h-12 w-fit items-center rounded-xl border border-line bg-raised px-6 text-[15px] font-semibold transition-colors hover:bg-line/40"
              >
                Open the Worker Portal
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="border-t border-line">
        <div className="relative mx-auto max-w-[1180px] px-5 py-24 text-center sm:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(50% 60% at 50% 100%, color-mix(in srgb, var(--badge) 12%, transparent) 0%, transparent 70%)",
            }}
          />
          <Reveal className="relative">
            <h2 className="mx-auto max-w-[18ch] font-extrabold leading-[1.04] tracking-[-0.045em] fluid-h2-lg">
              Put it up. Prove it.
            </h2>
            <p className="mx-auto mt-5 max-w-[50ch] text-[16px] leading-relaxed text-muted">
              Start a campaign, or start earning.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 min-[480px]:flex-row">
              <button
                onClick={onSignIn}
                disabled={signInDisabled}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-solid px-6 text-[15px] font-bold text-solid-ink transition-opacity hover:opacity-90 disabled:opacity-60 min-[480px]:w-auto"
              >
                {signInLabel}
              </button>
              <Link
                href="/worker"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-6 text-[15px] font-semibold transition-colors hover:bg-raised min-[480px]:w-auto"
              >
                Earn putting up posters
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <Mark />
            <span className="text-[14px] font-bold tracking-[-0.02em]">
              StickerBomb
            </span>
          </div>
          <p className="text-[13px] text-faint">
            Verified physical campaigns, from one sentence.
          </p>
        </div>
      </footer>
    </main>
  );
}
