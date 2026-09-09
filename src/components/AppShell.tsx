"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

const nav = [
  { href: "/", label: "Home", hint: "Create a campaign" },
  { href: "/analytics", label: "Analytics", hint: "Scans and placements" },
];

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M3 13h4l2.5-7 4 14L16 13h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m16 16 4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect
        x="13.5"
        y="13.5"
        width="4"
        height="4"
        rx="1"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = (localStorage.getItem("sb-theme") as "dark" | "light") || "dark";
    setTheme(stored);
  }, []);

  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("sb-theme", next);
  }

  return (
    <button
      onClick={flip}
      aria-label="Switch theme"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:text-ink"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
          <path
            d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Wallet() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address;

  if (!ready) {
    return <div className="h-10 w-24 animate-pulse rounded-xl bg-raised" />;
  }

  if (authenticated) {
    return (
      <button
        onClick={logout}
        className="flex h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-[14px] font-medium"
      >
        <span className="h-2 w-2 rounded-full bg-paid" />
        {address ? truncateAddress(address) : "Connected"}
      </button>
    );
  }

  return (
    <button
      onClick={login}
      className="h-10 rounded-xl bg-solid px-4 text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90"
    >
      Sign in
    </button>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
        <Link href="/" className="mb-9 flex items-center gap-2.5 px-2">
          <Mark />
          <span className="text-[19px] font-extrabold tracking-[-0.02em]">
            StickerBomb
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors ${
                  active
                    ? "border border-line bg-raised text-ink"
                    : "border border-transparent text-muted hover:text-ink"
                }`}
              >
                <span className="mt-[1px]">
                  {item.label === "Home" ? <HomeIcon /> : <PulseIcon />}
                </span>
                <span className="leading-tight">
                  <span className="block text-[14.5px] font-semibold">
                    {item.label}
                  </span>
                  <span className="block text-[12.5px] text-faint">
                    {item.hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <p className="px-2 text-[12.5px] leading-relaxed text-faint">
            Every campaign is funded for removal from day one.
          </p>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-5 py-3.5 sm:px-8">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <Mark />
            </Link>

            <label className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-line px-3.5 text-muted focus-within:text-ink">
              <SearchIcon />
              <input
                placeholder="Search campaigns and placements"
                className="w-full bg-transparent text-[14px] outline-none"
              />
              <span className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint sm:block">
                ⌘K
              </span>
            </label>

            <ThemeToggle />
            <Wallet />
          </div>
        </header>

        <nav className="flex gap-2 border-b border-line px-5 py-2.5 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ${
                pathname === item.href
                  ? "bg-raised text-ink"
                  : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
