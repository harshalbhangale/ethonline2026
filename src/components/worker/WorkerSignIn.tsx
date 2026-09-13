"use client";

import { usePrivy } from "@privy-io/react-auth";

export default function WorkerSignIn() {
  const { login } = usePrivy();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-7 pb-16 bg-[var(--bg)]">
      <div className="animate-[rise_0.5s_ease-out]">
        <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--faint)]">
          StickerBomb
        </span>

        <h1 className="mt-4 text-[32px] font-extrabold leading-[1.12] tracking-[-0.03em]">
          Put up posters.
          <br />
          Get paid.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
          Put posters up, or verify someone else&apos;s. Both pay, both near you.
        </p>

        <button
          onClick={login}
          className="mt-8 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] transition active:scale-[0.98] active:opacity-90"
        >
          Sign in
        </button>

        <div className="mt-4 flex items-center gap-1.5 text-[13px] text-[var(--faint)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          Payouts locked by the brand before you accept
        </div>
      </div>

      <style jsx>{`
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
