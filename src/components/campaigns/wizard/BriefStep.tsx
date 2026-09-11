"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Badge, Card } from "@/components/ui";
import { ClientApiError } from "@/lib/api/authenticated-fetch";
import { parseDeadlineInput } from "@/lib/campaigns/deadline";
import type { CampaignDto } from "@/lib/campaigns/types";
import { parseBrief } from "@/lib/parseBrief";

const samples = [
  "Put 10 posters around developer venues in New York. Finish by tomorrow. Budget $300.",
  "12 stickers near Koregaon Park by 6pm, budget $120",
  "Five posters around Shoreditch this weekend under $90",
];

const sampleNames = [
  "New York developer launch",
  "Koregaon Park launch",
  "Shoreditch weekend push",
];

/**
 * Only what this step can genuinely detect and might be worth double
 * checking. City lives on the next step now, where it's actually chosen from
 * real inventory rather than typed and hoped for.
 */
type BriefFieldKey = "placements" | "deadline" | "budget";

const fields: {
  key: BriefFieldKey;
  label: string;
  placeholder: string;
  numeric?: boolean;
}[] = [
  { key: "placements", label: "Placements", placeholder: "10", numeric: true },
  { key: "deadline", label: "Deadline", placeholder: "Tomorrow" },
  { key: "budget", label: "Budget", placeholder: "300", numeric: true },
];

export type BriefStepValues = {
  name: string;
  briefText: string;
  placementCount: number | null;
  budgetLimit: string | null;
  deadline: string | null;
  destinationUrl: string | null;
};

type FieldErrors = Partial<Record<BriefFieldKey | "name" | "brief" | "form", string>>;

/**
 * Just enough to start a draft: a name and one sentence. Placements, budget
 * and deadline are picked up automatically and shown for a quick check, but
 * none of them block Continue — a brand can set them here, on the quote, or
 * on the review step, whichever they reach first. Where the campaign runs is
 * the next step's job entirely, not asked here at all.
 */
export default function BriefStep({
  campaign,
  submitting,
  onSubmit,
}: {
  campaign: CampaignDto | null;
  submitting: boolean;
  onSubmit: (values: BriefStepValues) => Promise<void>;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [text, setText] = useState(campaign?.briefText ?? "");
  const [edits, setEdits] = useState<Partial<Record<BriefFieldKey, string>>>(
    () =>
      campaign
        ? {
            ...(campaign.placementCount !== null
              ? { placements: String(campaign.placementCount) }
              : {}),
            ...(campaign.budgetLimit ? { budget: campaign.budgetLimit } : {}),
            ...(campaign.deadline
              ? { deadline: new Date(campaign.deadline).toLocaleString() }
              : {}),
          }
        : {},
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const parsed = useMemo(() => parseBrief(text), [text]);

  const values: Record<BriefFieldKey, string> = {
    placements: edits.placements ?? parsed.placements,
    deadline: edits.deadline ?? parsed.deadline,
    budget: edits.budget ?? parsed.budget,
  };

  const detected = fields.filter((field) => values[field.key].trim()).length;
  const canContinue = Boolean(name.trim() && text.trim().length >= 10 && !submitting);

  function update(key: BriefFieldKey, value: string) {
    setEdits((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({ ...previous, [key]: undefined, form: undefined }));
  }

  function applySample(sample: string, index: number) {
    setText(sample);
    setName(sampleNames[index]);
    setEdits({});
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {};

    // Each of these is optional, but if something was typed into it, it has
    // to actually parse — an unreadable deadline should not silently vanish.
    let placementCount: number | null = null;
    if (values.placements.trim()) {
      placementCount = Number(values.placements);
      if (!Number.isInteger(placementCount) || placementCount < 1) {
        errors.placements = "Enter a whole number of placements.";
      }
    }

    let deadline: Date | null = null;
    if (values.deadline.trim()) {
      deadline = parseDeadlineInput(values.deadline);
      if (!deadline) {
        errors.deadline = "Use a future date, time, or a phrase like ‘tomorrow’.";
      }
    }

    let budget: string | null = null;
    if (values.budget.trim()) {
      budget = values.budget.trim().replace(/^\$/, "");
      if (!/^\d+(?:\.\d{1,2})?$/.test(budget)) {
        errors.budget = "Enter a positive amount with up to two decimals.";
      }
    }

    if (name.trim().length < 2) {
      errors.name = "Give the campaign a name of at least two characters.";
    }
    if (text.trim().length < 10) {
      errors.brief = "Describe the campaign in a full sentence.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    try {
      await onSubmit({
        name: name.trim(),
        briefText: text.trim(),
        placementCount,
        budgetLimit: budget,
        deadline: deadline ? deadline.toISOString() : null,
        destinationUrl: parsed.destination || null,
      });
    } catch (caught) {
      setFieldErrors({
        form:
          caught instanceof ClientApiError
            ? caught.message
            : "Could not save the campaign brief. Please try again.",
      });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card gradient className="p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge>Campaign brief</Badge>
          {detected > 0 ? (
            <span className="text-[13px] text-faint">
              {detected} of {fields.length} details found
            </span>
          ) : null}
        </div>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setEdits({});
            setFieldErrors((previous) => ({ ...previous, brief: undefined }));
          }}
          rows={3}
          placeholder="Put 10 posters around developer venues in New York. Finish by tomorrow. Budget $300."
          className="w-full resize-none bg-transparent text-[24px] font-semibold leading-[1.35] tracking-[-0.02em] outline-none sm:text-[28px]"
        />
        {fieldErrors.brief ? (
          <p className="mt-2 text-[12.5px] text-fail">{fieldErrors.brief}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {samples.map((sample, index) => (
            <button
              type="button"
              key={sample}
              onClick={() => applySample(sample, index)}
              className="max-w-full truncate rounded-full border border-line px-3.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:border-muted hover:text-ink"
            >
              {sample}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">Name it</h2>
          <p className="text-[13px] text-muted">
            Placements, budget and deadline are picked up below if you mention them —
            correct anything we misread, or leave them for later. Where it runs is next.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 border-b border-line bg-surface px-6 py-4">
          <span className="text-[13px] font-medium text-muted">Campaign name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors((previous) => ({ ...previous, name: undefined }));
            }}
            maxLength={160}
            placeholder="New York developer launch"
            className="w-full bg-transparent text-[17px] font-semibold outline-none"
          />
          {fieldErrors.name ? (
            <span className="text-[12px] text-fail">{fieldErrors.name}</span>
          ) : null}
        </label>

        <div className="grid gap-px bg-line sm:grid-cols-3">
          {fields.map((field) => {
            const value = values[field.key];
            const auto = Boolean(parsed[field.key] && edits[field.key] === undefined);

            return (
              <label key={field.key} className="flex flex-col gap-1.5 bg-surface px-6 py-4">
                <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  {field.label}
                  {auto ? (
                    <span
                      title="Detected from your brief"
                      className="h-1.5 w-1.5 rounded-full bg-badge"
                    />
                  ) : null}
                </span>
                <div className="flex items-center gap-1.5">
                  {field.key === "budget" && value ? (
                    <span className="text-[17px] font-semibold text-muted">$</span>
                  ) : null}
                  <input
                    value={value}
                    onChange={(event) => update(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    inputMode={field.numeric ? "decimal" : undefined}
                    className="w-full bg-transparent text-[17px] font-semibold outline-none"
                  />
                </div>
                {fieldErrors[field.key] ? (
                  <span className="text-[12px] text-fail">{fieldErrors[field.key]}</span>
                ) : null}
              </label>
            );
          })}
        </div>

        {fieldErrors.form ? (
          <p className="border-t border-fail/25 bg-fail/5 px-6 py-3 text-[13px] text-fail">
            {fieldErrors.form}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-5">
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted">
            Your brief is saved as a draft, so you can leave and pick it up later.
          </p>
          <button
            type="submit"
            disabled={!canContinue}
            className="h-11 rounded-xl bg-solid px-5 text-[14.5px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? "Saving…" : "Choose location"}
          </button>
        </div>
      </Card>
    </form>
  );
}
