"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { WorkerProvider } from "@/components/worker/WorkerStore";
import WorkerSignIn from "@/components/worker/WorkerSignIn";

const tabs = [
  { href: "/worker", label: "Jobs" },
  { href: "/worker/tasks", label: "My tasks" },
  { href: "/worker/wallet", label: "Wallet" },
];

function JobsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]">
      <rect x="3" y="7" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]">
      <path d="M4 7.5 6 9.5 10 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17.5 6 19.5 10 15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 8h7M13 18h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 12.5h2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const icons: Record<string, () => ReactNode> = {
  "/worker": JobsIcon,
  "/worker/tasks": TasksIcon,
  "/worker/wallet": WalletIcon,
};

export default function WorkerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, user, logout } = usePrivy();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--raised)]" />
      </div>
    );
  }

  if (!authenticated) {
    return <WorkerSignIn />;
  }

  const me = user?.wallet?.address ?? `privy_${user?.id}`;

  return (
    <WorkerProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col bg-[var(--bg)]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg)]/90 px-5 py-4 backdrop-blur">
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">
            StickerBomb
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--muted)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
            {me.startsWith("0x") ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Signed in"}
          </button>
        </header>

        <main className="flex-1 px-5 pb-28 pt-5">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[520px] justify-around border-t border-[var(--line)] bg-[var(--bg)]/95 px-2 pb-6 pt-2 backdrop-blur">
          {tabs.map((tab) => {
            const active =
              tab.href === "/worker"
                ? pathname === "/worker"
                : pathname.startsWith(tab.href);
            const Icon = icons[tab.href];
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-[var(--ink)]" : "text-[var(--faint)]"
                }`}
              >
                <Icon />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </WorkerProvider>
  );
}
