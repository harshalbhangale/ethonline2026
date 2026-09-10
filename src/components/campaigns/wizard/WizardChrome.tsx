"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { stepNumber, wizardStepOrder, wizardStepTitles } from "@/lib/campaigns/wizard";
import type { CampaignWizardStepValue } from "@/lib/campaigns/types";

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="6.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="13.5" y="6.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="6.5" y="13.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="13.5" y="13.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/**
 * Full-screen wizard frame. The Brand Portal sidebar is deliberately absent so
 * the map steps can use the whole viewport.
 *
 * `wide` lets a step opt out of the reading-width container, which the globe and
 * city map need.
 */
export default function WizardChrome({
  step,
  exitHref,
  summary,
  footer,
  wide = false,
  children,
}: {
  step: CampaignWizardStepValue;
  exitHref: string;
  summary?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const current = stepNumber(step);
  const total = wizardStepOrder.length;
  const { title, sub } = wizardStepTitles[step];

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex items-center gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/brand" className="flex items-center gap-2.5">
            <Mark />
            <span className="hidden text-[17px] font-extrabold tracking-[-0.02em] sm:block">
              StickerBomb
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-[13px] font-semibold text-muted">
              Step {current} of {total}
            </span>
            <Link
              href={exitHref}
              className="flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
            >
              Save and close
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="flex gap-1 px-5 pb-3 sm:px-8" aria-hidden>
          {wizardStepOrder.map((item, index) => (
            <span
              key={item}
              className={`h-1 flex-1 rounded-full ${
                index < current ? "bg-solid" : "bg-line"
              }`}
            />
          ))}
        </div>
      </header>

      <main className="flex-1">
        <div
          className={`mx-auto w-full px-5 py-7 sm:px-8 sm:py-9 ${
            wide ? "max-w-[1400px]" : "max-w-[880px] sm:py-12"
          }`}
        >
          <div className={wide ? "mb-5" : "mb-8"}>
            <h1
              className={`font-extrabold leading-[1.08] tracking-[-0.03em] ${
                wide ? "text-[26px] sm:text-[30px]" : "text-[32px] sm:text-[38px]"
              }`}
            >
              {title}
            </h1>
            <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-muted">
              {sub}
            </p>
          </div>

          {children}
        </div>
      </main>

      {footer || summary ? (
        <footer className="sticky bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
            <div className="min-w-0 text-[12.5px] leading-relaxed text-muted">
              {summary}
            </div>
            <div className="flex items-center gap-3">{footer}</div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
