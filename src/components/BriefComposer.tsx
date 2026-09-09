"use client";

import { useMemo, useState } from "react";
import { parseBrief, type Brief } from "@/lib/parseBrief";
import { Badge, Card } from "@/components/ui";

const samples = [
  "Place 3 artistic QR posters around the venue tonight, keep it under $60 and send people to our waitlist",
  "10 stickers near Koregaon Park by 6pm, budget $120, point them at drip.xyz/launch",
  "Five posters in Bandra this weekend under $90 for our signup page",
];

const fields: { key: keyof Brief; label: string; placeholder: string }[] = [
  { key: "placements", label: "Placements", placeholder: "3" },
  { key: "area", label: "Area", placeholder: "Where they go" },
  { key: "deadline", label: "Deadline", placeholder: "Tonight" },
  { key: "budget", label: "Budget", placeholder: "60" },
  { key: "destination", label: "Scans go to", placeholder: "your-site.com" },
];

export default function BriefComposer() {
  const [text, setText] = useState("");
  const [edits, setEdits] = useState<Partial<Brief>>({});
  const [sent, setSent] = useState(false);

  const parsed = useMemo(() => parseBrief(text), [text]);
  const brief = { ...parsed, ...edits } as Brief;
  const filled = fields.filter((f) => brief[f.key].trim()).length;
  const ready = filled >= 3;

  function update(key: keyof Brief, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setSent(false);
  }

  function reset() {
    setText("");
    setEdits({});
    setSent(false);
  }

  return (
    <div className="space-y-5">
      <Card gradient className="p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge>New campaign</Badge>
          <span className="text-[13px] text-faint">
            {filled} of {fields.length} details found
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdits({});
            setSent(false);
          }}
          rows={3}
          placeholder="Describe the campaign in one sentence."
          className="w-full resize-none bg-transparent text-[26px] font-semibold leading-[1.35] tracking-[-0.02em] outline-none sm:text-[30px]"
        />

        <div className="mt-6 flex flex-wrap gap-2">
          {samples.map((sample) => (
            <button
              key={sample}
              onClick={() => {
                setText(sample);
                setEdits({});
                setSent(false);
              }}
              className="max-w-full truncate rounded-full border border-line px-3.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:border-muted hover:text-ink"
            >
              {sample}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-0.01em]">
              Campaign details
            </h2>
            <p className="text-[13px] text-muted">
              Read from your sentence. Correct anything that looks wrong.
            </p>
          </div>
          {text.trim() ? (
            <button
              onClick={reset}
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-2">
          {fields.map((field) => {
            const value = brief[field.key];
            const auto = !!parsed[field.key] && edits[field.key] === undefined;
            return (
              <label
                key={field.key}
                className="flex flex-col gap-1.5 bg-surface px-6 py-4"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  {field.label}
                  {auto ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-badge" />
                  ) : null}
                </span>
                <div className="flex items-center gap-1.5">
                  {field.key === "budget" && value ? (
                    <span className="text-[17px] font-semibold text-muted">$</span>
                  ) : null}
                  <input
                    value={value}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-transparent text-[17px] font-semibold outline-none"
                  />
                </div>
              </label>
            );
          })}
          <div className="flex flex-col justify-center gap-1.5 bg-surface px-6 py-4">
            <span className="text-[13px] font-medium text-muted">Removal</span>
            <span className="text-[17px] font-semibold text-paid">
              Funded from day one
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-5">
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted">
            Placement, proof and the second-person check are handled by
            StickerBomb. You approve the plan before anything is printed.
          </p>
          <button
            disabled={!ready}
            onClick={() => setSent(true)}
            className="h-11 rounded-xl bg-solid px-5 text-[14.5px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {sent ? "Campaign drafted" : "Create campaign"}
          </button>
        </div>
      </Card>

      {sent ? (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5">
          <span className="text-[14.5px] font-semibold">Draft saved</span>
          <span className="text-[13.5px] text-muted">
            {brief.placements || "—"} placements
          </span>
          <span className="text-[13.5px] text-muted">
            {brief.area || "Area not set"}
          </span>
          <span className="text-[13.5px] text-muted">
            {brief.budget ? `$${brief.budget}` : "Budget not set"}
          </span>
          <span className="text-[13.5px] text-muted">
            {brief.deadline || "No deadline"}
          </span>
        </Card>
      ) : null}
    </div>
  );
}
