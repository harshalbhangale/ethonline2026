"use client";

import {
  CaretDownIcon,
  CheckIcon,
  CopyIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

function CampaignIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M4 7.5h16M7 4v3.5M17 4v3.5M5 7.5h14a1 1 0 0 1 1 1V20H4V8.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12h3m2 0h3m-8 4h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlacementIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path
        d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <rect x="3" y="6" width="18" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10.5h18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 14.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <path d="M4 20V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 20v-5.5M12.5 20V9M17 20v-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Mark() {
  return (
    <Image src="/logo_remove.png" alt="StickerBomb" width={55} height={55} className="h-[52px] w-[52px] object-contain" />
  );
}

const nav = [
  {
    href: "/brand",
    label: "Campaigns",
    hint: "Create and monitor",
    Icon: CampaignIcon,
  },
  {
    href: "/brand/placements",
    label: "Placements",
    hint: "Installation progress",
    Icon: PlacementIcon,
  },
  {
    href: "/brand/payments",
    label: "Treasury",
    hint: "Wallet, policy and payouts",
    Icon: PaymentIcon,
  },
  {
    href: "/brand/analytics",
    label: "Analytics",
    hint: "Scan attribution",
    Icon: AnalyticsIcon,
  },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored =
      (localStorage.getItem("sb-theme") as "dark" | "light") || "dark";
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
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
          <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Wallet() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closing on outside click and Escape is what makes this read as a real
  // menu rather than a button that happens to show a panel.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!ready) {
    return <div className="h-10 w-24 animate-pulse rounded-xl bg-raised" />;
  }

  if (authenticated) {
    return (
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-[14px] font-medium transition-colors hover:bg-raised"
        >
          <span className="h-2 w-2 rounded-full bg-paid" />
          {address ? truncateAddress(address) : "Connected"}
          <CaretDownIcon
            weight="bold"
            className={`h-3 w-3 text-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            <div className="border-b border-line px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Signed in
              </p>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {user?.email?.address ?? user?.google?.email ?? "Privy account"}
              </p>
              {address ? (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-mono text-ink transition-colors hover:bg-raised"
                >
                  {truncateAddress(address)}
                  {copied ? (
                    <CheckIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-paid" />
                  ) : (
                    <CopyIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-faint" />
                  )}
                </button>
              ) : null}
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13.5px] font-medium text-fail transition-colors hover:bg-fail/10"
            >
              <SignOutIcon weight="bold" className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
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

function isActive(pathname: string, href: string) {
  // Campaigns owns the section root and individual campaign pages, but must not
  // light up for its sibling sections.
  if (href === "/brand") {
    return pathname === "/brand" || pathname.startsWith("/brand/campaigns");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
        <Link href="/brand" className="mb-7 flex items-center gap-2.5 px-2">
          <Mark />
          <span className="text-[19px] font-extrabold tracking-[-0.02em]">StickerBomb</span>
        </Link>

        <Link
          href="/brand/new"
          className="mb-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-solid text-[14px] font-semibold text-solid-ink transition-opacity hover:opacity-90"
        >
          <PlusIcon />
          New campaign
        </Link>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                  active
                    ? "border-line bg-raised text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <span className="mt-[1px]">
                  <item.Icon />
                </span>
                <span className="leading-tight">
                  <span className="block text-[14.5px] font-semibold">{item.label}</span>
                  <span className="block text-[12.5px] text-faint">{item.hint}</span>
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
            <Link href="/brand" className="flex items-center gap-2 lg:hidden">
              <Mark />
            </Link>

            <label className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-line px-3.5 text-muted focus-within:text-ink">
              <SearchIcon />
              <input
                placeholder="Search campaigns"
                aria-label="Search campaigns"
                className="w-full bg-transparent text-[14px] outline-none"
              />
              <span className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint sm:block">⌘K</span>
            </label>

            <Link
              href="/brand/new"
              aria-label="New campaign"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-solid text-solid-ink lg:hidden"
            >
              <PlusIcon />
            </Link>

            <ThemeToggle />
            <Wallet />
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto border-b border-line px-5 py-2.5 lg:hidden">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ${
                  active ? "bg-raised text-ink" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
