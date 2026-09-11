"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The QR encodes the poster's scan link, so a decode gives a URL whose last
 * path segment is the code. Workers can also type the code printed under it.
 */
export function extractShortCode(decoded: string) {
  const trimmed = decoded.trim();

  try {
    const segments = new URL(trimmed).pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (last) return last.toUpperCase();
  } catch {
    // Not a URL: fall through and treat the payload as the code itself.
  }

  return trimmed.toUpperCase();
}

export default function PosterCodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stop = useCallback(() => setScanning(false), []);

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    async function run() {
      // Loaded on demand: the decoder is ~48 kB and most sessions never scan.
      const { default: jsQR } = await import("jsqr");
      if (cancelled) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        if (!cancelled) {
          setCameraError(
            "Could not open the camera. Type the code printed under the QR instead.",
          );
          setScanning(false);
        }
        return;
      }

      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      const context = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (cancelled || !context) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });

          if (found?.data) {
            onChange(extractShortCode(found.data));
            setScanning(false);
            return;
          }
        }

        frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    }

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, onChange]);

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor="poster-code"
          className="text-[14px] font-semibold"
        >
          Poster code
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCameraError(null);
            setScanning((current) => !current);
          }}
          className="shrink-0 text-[13px] font-medium text-[var(--amber)] disabled:opacity-35"
        >
          {scanning ? "Stop scanning" : "Scan QR"}
        </button>
      </div>

      {scanning && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-[220px] w-full object-cover"
          />
        </div>
      )}

      <input
        id="poster-code"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        onBlur={stop}
        disabled={disabled}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="Scan the QR, or type the code"
        className="mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[15px] font-medium tracking-[0.12em] uppercase placeholder:tracking-normal placeholder:normal-case placeholder:text-[var(--faint)] disabled:opacity-35"
      />

      {cameraError && (
        <p className="mt-2 text-[13px] text-[var(--amber)]">{cameraError}</p>
      )}

      <p className="mt-2 text-[13px] leading-relaxed text-[var(--faint)]">
        This proves you are standing at the right poster.
      </p>
    </div>
  );
}
