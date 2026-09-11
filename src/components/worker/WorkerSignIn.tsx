"use client";

import { usePrivy } from "@privy-io/react-auth";

export default function WorkerSignIn() {
  const { login } = usePrivy();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-7 pb-16 bg-[var(--bg)]">
      <span className="text-[17px] font-extrabold tracking-[-0.02em]">
        StickerBomb
      </span>

      <h1 className="mt-8 text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
        Put up posters.
        <br />
        Get paid.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
        Sign in to see jobs near you. The money is locked by the brand before you
        accept, so you always get paid for work that checks out.
      </p>

      <button
        onClick={login}
        className="mt-8 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] active:opacity-90"
      >
        Sign in
      </button>

      <p className="mt-4 text-[13px] leading-relaxed text-[var(--faint)]">
        A wallet is created for you automatically. Payouts land there.
      </p>
    </div>
  );
}
