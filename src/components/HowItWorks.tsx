"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

const steps = [
  {
    title: "You describe it",
    body: "One sentence sets the placements, area, deadline and budget.",
  },
  {
    title: "Someone places it",
    body: "A local installer puts each poster on an approved surface and submits proof.",
  },
  {
    title: "Someone else checks it",
    body: "A different verified person confirms the poster is really there before anyone is paid.",
  },
];

export default function HowItWorks() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <Card className="relative mb-6 px-6 py-6 sm:px-8">
      <button
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="absolute right-5 top-5 text-faint transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path
            d="m6 6 12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <h2 className="mb-5 text-[15px] font-bold tracking-[-0.01em]">
        How it works
      </h2>

      <ol className="grid gap-6 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[12.5px] font-semibold text-muted">
              {i + 1}
            </span>
            <span>
              <span className="block text-[14.5px] font-semibold">
                {step.title}
              </span>
              <span className="mt-1 block max-w-[34ch] text-[13px] leading-relaxed text-muted">
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
