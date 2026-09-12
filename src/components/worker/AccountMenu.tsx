"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

/** The address chip, with sign-out behind a tap rather than beside it. */
export default function AccountMenu() {
  const { user, logout } = usePrivy();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const address = user?.wallet?.address ?? null;
  const label = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Signed in";

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--line)] py-1.5 pl-3 pr-2.5 text-[12px] text-[var(--muted)] active:opacity-80"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
        <span className="font-mono">{label}</span>
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
          <path
            d="m7 10 5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[280px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-lg"
        >
          <div className="px-4 pb-3 pt-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--faint)]">
              Signed in
            </p>
            <p className="mt-1 text-[13px] text-[var(--ink)]">Privy account</p>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5">
              <span className="truncate font-mono text-[13px] text-[var(--ink)]">
                {address ?? "Created on your first payout"}
              </span>
              {address && (
                <button
                  type="button"
                  aria-label="Copy address"
                  onClick={() => void navigator.clipboard.writeText(address)}
                  className="shrink-0 text-[var(--muted)] active:opacity-70"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M5 15V6a2 2 0 0 1 2-2h9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {address && (
            <a
              href={`https://sepolia.etherscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="block border-t border-[var(--line)] px-4 py-3 text-[13px] text-[var(--muted)] active:bg-[var(--raised)]"
            >
              View on explorer ↗
            </a>
          )}

          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 border-t border-[var(--line)] px-4 py-3 text-left text-[13px] font-medium text-[var(--bad)] active:bg-[var(--raised)]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1M9 12h11m0 0-3-3m3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
