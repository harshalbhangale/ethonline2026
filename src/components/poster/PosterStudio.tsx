"use client";

import {
  CheckCircleIcon,
  LockSimpleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import PosterCanvas from "@/components/poster/PosterCanvas";
import { usePosterRender } from "@/components/poster/usePosterRender";
import {
  colorLabels,
  defaultDesign,
  designAllowance,
  ditherLabels,
  posterColors,
  posterDithers,
  posterStyles,
  resolveDesign,
  styleLabels,
  type PosterDesign,
} from "@/lib/assets/design";
import type { ScanReport } from "@/lib/assets/scan-check";
import type { AssetTypeValue } from "@/lib/campaigns/types";
import { cn } from "@/lib/cn";

function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: ReactNode; locked?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-line bg-raised p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={Boolean(option.locked)}
            title={option.locked}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold transition-colors",
              active ? "text-solid-ink" : "text-muted hover:text-ink",
              option.locked && "cursor-not-allowed opacity-45 hover:text-muted",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-lg bg-solid"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1">
              {option.locked ? <LockSimpleIcon size={11} weight="bold" /> : null}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: [string, string];
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[12px] font-semibold text-muted">
        {label}
        <span className="tabular-nums text-faint">{format ? format(value) : ""}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-1 w-full accent-[color:var(--badge)]"
      />
      {hint ? (
        <span className="mt-1 flex justify-between text-[10.5px] text-faint">
          <span>{hint[0]}</span>
          <span>{hint[1]}</span>
        </span>
      ) : null}
    </label>
  );
}

function ScanMeter({ report, busy }: { report: ScanReport | null; busy: boolean }) {
  const checks: [keyof ScanReport, string][] = [
    ["close", "Close up"],
    ["distance", "From 2 m"],
    ["blurred", "Out of focus"],
  ];
  const score = report?.score ?? 0;
  const summary = !report
    ? "Checking…"
    : report.printable && score === 3
      ? "Scans everywhere"
      : report.printable
        ? "Scans well"
        : "Legibility will be raised automatically for print";
  const tone = !report ? "text-muted" : report.printable ? "text-paid" : "text-badge";

  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[12.5px] font-semibold transition-colors", tone)}>{summary}</p>
        <span className={cn("text-[11px] text-faint transition-opacity", busy ? "opacity-100" : "opacity-0")}>
          rendering…
        </span>
      </div>
      <div className="mt-2 flex gap-3">
        {checks.map(([key, label]) => {
          const ok = report ? Boolean(report[key]) : null;
          return (
            <span key={key} className="flex items-center gap-1 text-[11.5px] text-muted">
              {ok === null ? (
                <span className="size-3 rounded-full border border-line" />
              ) : ok ? (
                <CheckCircleIcon className="text-paid" size={13} weight="fill" />
              ) : key === "close" ? (
                <XCircleIcon className="text-fail" size={13} weight="fill" />
              ) : (
                <WarningCircleIcon className="text-badge" size={13} weight="fill" />
              )}
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The poster QR studio: style, colour and tuning, with a live preview drawn
 * by the same renderer that prints, and a scan check run on every change.
 */
export default function PosterStudio({
  assetType,
  stored,
  artworkUrl,
  onSave,
}: {
  assetType: AssetTypeValue;
  /** The campaign's saved design, already resolved. */
  stored: PosterDesign;
  artworkUrl: string | null;
  onSave: (design: PosterDesign) => Promise<void>;
}) {
  const hasArtwork = Boolean(artworkUrl);
  const allowance = designAllowance(assetType);
  const [design, setDesign] = useState<PosterDesign>(stored);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const touched = useRef(false);

  // Artwork just arrived on an untouched plain design: switch to the tier's
  // artwork default so the upload visibly does something.
  const hadArtwork = useRef(hasArtwork);
  useEffect(() => {
    if (hasArtwork && !hadArtwork.current && !touched.current) {
      setDesign(defaultDesign(assetType, true));
      touched.current = true;
    }
    hadArtwork.current = hasArtwork;
  }, [hasArtwork, assetType]);

  const effective = resolveDesign(design, assetType, hasArtwork);
  const { image, report, block, busy, artworkError } = usePosterRender(effective, artworkUrl);

  // Saved quietly after the brand stops adjusting.
  const saveKey = JSON.stringify(effective);
  const firstSave = useRef(true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      onSaveRef
        .current(JSON.parse(saveKey))
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [saveKey]);

  function update(patch: Partial<PosterDesign>) {
    touched.current = true;
    setDesign((previous) => ({ ...previous, ...patch }));
  }

  // Drag the preview to reposition the artwork inside the code.
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const canPan = hasArtwork && effective.style !== "PLAIN";
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canPan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, fx: effective.focusX, fy: effective.focusY };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const width = event.currentTarget.clientWidth;
    const sensitivity = 1 / (width * effective.zoom);
    update({
      focusX: Math.min(1, Math.max(0, start.fx - (event.clientX - start.x) * sensitivity)),
      focusY: Math.min(1, Math.max(0, start.fy - (event.clientY - start.y) * sensitivity)),
    });
  }

  const developKey = `${effective.style}|${effective.color}|${effective.dither}|${artworkUrl}`;
  const lockedColour = "Colour comes with the Very Magic and NFC tiers — change it on the Where step.";
  const lockedStyle = "Artwork styles come with the Magic tiers and above — change it on the Where step.";

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-[#0f0f10] touch-none select-none",
            canPan && "cursor-grab active:cursor-grabbing",
          )}
        >
          {image ? (
            <PosterCanvas
              image={image}
              block={block}
              developKey={developKey}
              className="h-full w-full"
            />
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-faint">Preparing preview…</div>
          )}
          {canPan ? (
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10.5px] font-semibold text-white/80 backdrop-blur">
              Drag to reposition
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <ScanMeter report={report} busy={busy} />
        </div>
        {artworkError ? <p className="mt-2 text-[12px] text-fail">{artworkError}</p> : null}
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Style</p>
          <Segmented
            id="style"
            value={effective.style}
            onChange={(style) => update({ style })}
            options={posterStyles.map((style) => ({
              value: style,
              label: styleLabels[style].label,
              locked: !allowance.styles.includes(style)
                ? lockedStyle
                : style !== "PLAIN" && !hasArtwork
                  ? "Upload artwork to use this style."
                  : undefined,
            }))}
          />
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
            {styleLabels[effective.style].hint}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Colour</p>
          <Segmented
            id="color"
            value={effective.color}
            onChange={(color) => update({ color })}
            options={posterColors.map((color) => ({
              value: color,
              label: color === "MONO" ? "B&W" : color === "ARTWORK" ? "Artwork" : "Brand",
              locked: !allowance.colors.includes(color)
                ? lockedColour
                : color === "ARTWORK" && !hasArtwork
                  ? "Upload artwork to use its colours."
                  : undefined,
            }))}
          />
          <p className="mt-1.5 text-[11.5px] text-faint">{colorLabels[effective.color]}</p>
          {effective.color === "BRAND" ? (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              <input
                type="color"
                value={effective.brandColor}
                onChange={(event) => update({ brandColor: event.target.value })}
                className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent"
              />
              <span className="font-mono">{effective.brandColor}</span>
            </label>
          ) : null}
        </div>

        {effective.style === "HALFTONE" ? (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Grain</p>
            <Segmented
              id="dither"
              value={effective.dither}
              onChange={(dither) => update({ dither })}
              options={posterDithers.map((dither) => ({ value: dither, label: ditherLabels[dither] }))}
            />
          </div>
        ) : null}

        {effective.style !== "PLAIN" ? (
          <div className="space-y-3.5 border-t border-line pt-4">
            <Slider
              label="Legibility"
              hint={["More artwork", "More code"]}
              value={effective.legibility}
              min={0}
              max={0.9}
              step={0.05}
              onChange={(legibility) => update({ legibility })}
            />
            <Slider
              label="Zoom"
              value={effective.zoom}
              min={1}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(zoom) => update({ zoom })}
            />
            <Slider
              label="Brightness"
              value={effective.brightness}
              min={-1}
              max={1}
              step={0.05}
              format={(v) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`)}
              onChange={(brightness) => update({ brightness })}
            />
            <Slider
              label="Contrast"
              value={effective.contrast}
              min={-1}
              max={1}
              step={0.05}
              format={(v) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`)}
              onChange={(contrast) => update({ contrast })}
            />
          </div>
        ) : null}

        <p className="text-[11px] text-faint">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved. Every printed poster uses this design."
              : saveState === "error"
                ? "Could not save the design. Your last saved design will be used."
                : "Every printed poster uses this design, and each is decoded before it can print."}
        </p>
      </div>
    </div>
  );
}
