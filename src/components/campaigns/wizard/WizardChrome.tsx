"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  stageFromStep,
  stageNumber,
  wizardStages,
  wizardStageTitles,
} from "@/lib/campaigns/wizard";
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
 * The campaign wizard as a large dialog over the Brand Portal.
 *
 * Every step saves on continue, so closing (the button, Escape or a click on
 * the backdrop) never loses work. `wide` lets the globe and city map steps use
 * the full dialog width.
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
  const router = useRouter();
  const current = stageNumber(step);
  const total = wizardStages.length;
  const stage = stageFromStep(step);
  const { title, sub } = wizardStageTitles[stage];
  const reduce = useReducedMotion();

  // Which way the brand is travelling, so a step slides in from the side it
  // came from: forward from the right, back from the left.
  const previousStage = useRef(current);
  const direction = current >= previousStage.current ? 1 : -1;
  useEffect(() => {
    previousStage.current = current;
  }, [current]);
  const distance = reduce ? 0 : 28;
  const stepVariants = {
    enter: (dir: number) => ({ opacity: 0, x: distance * dir }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: -distance * dir }),
  };

  // Lock the page behind the dialog and close it with Escape.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(exitHref);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [exitHref, router]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) router.push(exitHref);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-5"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-wizard-title"
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="flex h-full max-h-[960px] w-full max-w-[1320px] flex-col overflow-hidden rounded-[24px] border border-line bg-bg shadow-2xl"
      >
        <header className="shrink-0 border-b border-line">
          <div className="flex items-center gap-4 px-5 py-3.5 sm:px-7">
            <span className="flex items-center gap-2.5">
              <Mark />
              <span className="hidden text-[16px] font-extrabold tracking-[-0.02em] sm:block">
                New campaign
              </span>
            </span>

            <div className="ml-auto flex items-center gap-4">
              <span className="flex items-center text-[13px] font-semibold text-muted">
                Step&nbsp;
                <span className="relative inline-grid overflow-hidden tabular-nums">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={current}
                      initial={{ y: reduce ? 0 : 12 * direction, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: reduce ? 0 : -12 * direction, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                    >
                      {current}
                    </motion.span>
                  </AnimatePresence>
                </span>
                &nbsp;of {total}
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

          <div className="flex gap-1 px-5 pb-3 sm:px-7" aria-hidden>
            {wizardStages.map((item, index) => (
              <span key={item} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <motion.span
                  className="block h-full origin-left rounded-full bg-solid"
                  initial={false}
                  animate={{ scaleX: index < current ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 180, damping: 26 }}
                />
              </span>
            ))}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={`mx-auto w-full px-5 py-6 sm:px-8 sm:py-8 ${
              wide ? "max-w-[1400px]" : "max-w-[880px]"
            }`}
          >
            <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={stage}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
            >
            <div className={wide ? "mb-5" : "mb-7"}>
              <h1
                id="campaign-wizard-title"
                className={`font-extrabold leading-[1.08] tracking-[-0.03em] ${
                  wide ? "text-[24px] sm:text-[28px]" : "text-[30px] sm:text-[34px]"
                }`}
              >
                {title}
              </h1>
              <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-muted">{sub}</p>
            </div>

            {children}
            </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {footer || summary ? (
          <footer className="shrink-0 border-t border-line bg-bg">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-7">
              <div className="min-w-0 text-[12.5px] leading-relaxed text-muted">{summary}</div>
              <div className="flex items-center gap-3">{footer}</div>
            </div>
          </footer>
        ) : null}
      </motion.div>
    </div>
  );
}
