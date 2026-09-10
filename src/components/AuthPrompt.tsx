"use client";

import { Card } from "@/components/ui";

export default function AuthPrompt({
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  return (
    <Card gradient className="px-6 py-10 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-raised text-badge">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12a1 1 0 0 1 1 1v8H5v-8a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-[21px] font-bold tracking-[-0.02em]">
        Sign in to your brand workspace
      </h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        Connect with Privy to create campaigns and load the campaigns owned by
        your organization.
      </p>
      <button
        onClick={onSignIn}
        className="mt-6 h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90"
      >
        Sign in with Privy
      </button>
    </Card>
  );
}
