"use client";

import {
  CheckCircleIcon,
  CircleNotchIcon,
  FileArrowUpIcon,
  ImageSquareIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

const MAGNET_DISTANCE = 180;
const MAX_MAGNET_OFFSET = 10;
const MAGNET_SPRING = { damping: 24, mass: 0.65, stiffness: 280 };

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unit;
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function isFileDrag(dataTransfer: DataTransfer | null) {
  return dataTransfer ? Array.from(dataTransfer.types).includes("Files") : false;
}

function acceptsFile(file: File, accept: string) {
  if (!accept.trim()) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .some((rule) =>
      rule.startsWith(".")
        ? name.endsWith(rule)
        : rule.endsWith("/*")
          ? type.startsWith(rule.slice(0, -1))
          : type === rule,
    );
}

/**
 * A drop target that leans toward a file being dragged near it.
 *
 * Wired for a single image upload: `onFile` does the real work and the zone
 * shows it happening, then shows the uploaded image itself rather than a
 * filename, because for artwork the picture is the confirmation.
 */
export function MagneticDropZone({
  accept = "image/jpeg,image/png,image/webp",
  className,
  maxSize = 10 * 1024 * 1024,
  disabled = false,
  uploading = false,
  previewUrl,
  hint,
  onFile,
}: {
  accept?: string;
  className?: string;
  maxSize?: number;
  disabled?: boolean;
  uploading?: boolean;
  /** The saved image, once there is one. */
  previewUrl?: string | null;
  hint?: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const reduce = useReducedMotion();

  const magnetX = useMotionValue(0);
  const magnetY = useMotionValue(0);
  const magnetScale = useMotionValue(1);
  const glowX = useMotionValue(0);
  const glowY = useMotionValue(0);
  const springX = useSpring(magnetX, MAGNET_SPRING);
  const springY = useSpring(magnetY, MAGNET_SPRING);
  const springScale = useSpring(magnetScale, MAGNET_SPRING);
  const springGlowX = useSpring(glowX, MAGNET_SPRING);
  const springGlowY = useSpring(glowY, MAGNET_SPRING);
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0) scale(${springScale})`;
  const glowTransform = useMotionTemplate`translate3d(${springGlowX}px, ${springGlowY}px, 0)`;

  const resetMagnet = useCallback(() => {
    magnetX.set(0);
    magnetY.set(0);
    magnetScale.set(1);
    glowX.set(0);
    glowY.set(0);
    setIsNear(false);
    setIsOver(false);
  }, [glowX, glowY, magnetScale, magnetX, magnetY]);

  useEffect(() => {
    if (disabled) return;

    function onWindowDragOver(event: globalThis.DragEvent) {
      if (!isFileDrag(event.dataTransfer)) return;
      const zone = zoneRef.current;
      if (!zone) return;

      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const edgeX = Math.max(Math.abs(event.clientX - centerX) - rect.width / 2, 0);
      const edgeY = Math.max(Math.abs(event.clientY - centerY) - rect.height / 2, 0);
      const distance = Math.hypot(edgeX, edgeY);
      const over =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      const proximity = Math.max(0, 1 - distance / MAGNET_DISTANCE);

      if (proximity === 0) {
        resetMagnet();
        return;
      }

      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const pointer = Math.max(Math.hypot(dx, dy), 1);
      const offset = over ? 0 : proximity * MAX_MAGNET_OFFSET;

      magnetX.set(reduce ? 0 : (dx / pointer) * offset);
      magnetY.set(reduce ? 0 : (dy / pointer) * offset);
      magnetScale.set(reduce ? 1 : over ? 1.02 : 1.008);
      glowX.set(reduce ? 0 : dx);
      glowY.set(reduce ? 0 : dy);
      setIsNear(true);
      setIsOver(over);
    }

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragend", resetMagnet);
    window.addEventListener("drop", resetMagnet);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragend", resetMagnet);
      window.removeEventListener("drop", resetMagnet);
    };
  }, [disabled, glowX, glowY, magnetScale, magnetX, magnetY, resetMagnet, reduce]);

  function accept_(file: File | undefined) {
    if (!file) return;
    if (!acceptsFile(file, accept)) {
      setError(`${file.name} is not a supported image. Use JPG, PNG or WebP.`);
      return;
    }
    if (file.size > maxSize) {
      setError(`${file.name} is larger than ${formatBytes(maxSize)}.`);
      return;
    }
    setError(null);
    setLastFile(file);
    onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resetMagnet();
    if (disabled || uploading) return;
    accept_(event.dataTransfer.files[0]);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer) || disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    accept_(event.target.files?.[0]);
    event.target.value = "";
  }

  const title = uploading
    ? "Uploading…"
    : isOver
      ? "Let go to add it"
      : isNear
        ? "Bring it closer"
        : "Drop your artwork here";

  return (
    <motion.div
      ref={zoneRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ transform: reduce ? undefined : transform }}
      className={cn(
        "relative flex min-h-56 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-8 text-center outline-none",
        "transition-[border-color,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        isOver
          ? "border-badge bg-badge/10"
          : isNear
            ? "border-badge/60 bg-badge/5"
            : "border-line bg-raised/60",
        disabled && "opacity-60",
        className,
      )}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInput} />

      <motion.div
        aria-hidden
        style={{ transform: glowTransform }}
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -mt-20 -ml-20 size-40 rounded-full bg-badge/25 blur-3xl transition-opacity duration-200",
          isNear ? "opacity-100" : "opacity-0",
        )}
      />

      {previewUrl && !uploading ? (
        <div className="relative flex w-full flex-col items-center">
          <motion.img
            key={previewUrl}
            src={previewUrl}
            alt="Campaign artwork"
            initial={reduce ? false : { opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="h-40 w-auto rounded-xl border border-line object-contain shadow-lg"
          />
          <div className="mt-4 flex items-center gap-1.5">
            <CheckCircleIcon aria-hidden className="text-paid" size={15} weight="fill" />
            <p className="text-[13px] font-semibold">Artwork ready</p>
          </div>
          {lastFile ? (
            <p className="mt-0.5 max-w-full truncate font-mono text-[10.5px] uppercase text-faint">
              {lastFile.name} · {formatBytes(lastFile.size)}
            </p>
          ) : null}
          {!disabled ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-semibold text-muted transition-[background-color,transform] duration-150 hover:text-ink active:scale-[0.97]"
            >
              <UploadSimpleIcon aria-hidden size={14} weight="bold" />
              Replace
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="relative flex flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-badge focus-visible:ring-offset-4 focus-visible:ring-offset-bg disabled:cursor-not-allowed"
        >
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-xl border bg-surface shadow-sm transition-[border-color] duration-200",
              isOver ? "border-badge" : "border-line",
            )}
          >
            {uploading ? (
              <CircleNotchIcon aria-hidden className="animate-spin text-badge motion-reduce:animate-none" size={22} weight="bold" />
            ) : isNear ? (
              <ImageSquareIcon aria-hidden className="text-badge" size={23} weight="fill" />
            ) : (
              <FileArrowUpIcon aria-hidden className="text-muted" size={23} weight="fill" />
            )}
          </div>
          <p className="mt-4 text-[14px] font-semibold">{title}</p>
          <p className="mt-1 text-[12px] leading-5 text-faint">
            {hint ?? `or click to browse · JPG, PNG or WebP up to ${formatBytes(maxSize)}`}
          </p>
        </button>
      )}

      {error ? (
        <p aria-live="polite" className="relative mt-4 max-w-72 text-[12px] leading-5 text-fail">
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}
