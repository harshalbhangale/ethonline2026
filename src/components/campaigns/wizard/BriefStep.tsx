"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Badge, Card } from "@/components/ui";
import { ClientApiError } from "@/lib/api/authenticated-fetch";
import { parseDeadlineInput } from "@/lib/campaigns/deadline";
import { findPlaceByCity } from "@/lib/campaigns/places";
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

type BriefFieldKey = "placements" | "city" | "countryName" | "deadline" | "budget";

const fields: {
  key: BriefFieldKey;
  label: string;
  placeholder: string;
  numeric?: boolean;
}[] = [
  { key: "placements", label: "Placements", placeholder: "10", numeric: true },
  { key: "city", label: "City", placeholder: "New York" },
  { key: "countryName", label: "Country", placeholder: "United States" },
  { key: "deadline", label: "Deadline", placeholder: "Tomorrow" },
  { key: "budget", label: "Budget", placeholder: "300", numeric: true },
];

export type BriefStepValues = {
  name: string;
  briefText: string;
  placementCount: number;
  budgetLimit: string;
  deadline: string;
  city: string;
  countryCode: string;
  countryName: string;
  destinationUrl: string | null;
};

type FieldErrors = Partial<
  Record<BriefFieldKey | "name" | "brief" | "form", string>
>;

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
            ...(campaign.city ? { city: campaign.city } : {}),
            ...(campaign.countryName
              ? { countryName: campaign.countryName }
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
    city: edits.city ?? parsed.city,
    countryName: edits.countryName ?? parsed.countryName,
    deadline: edits.deadline ?? parsed.deadline,
    budget: edits.budget ?? parsed.budget,
  };

  const detected = fields.filter((field) => values[field.key].trim()).length;
  const canContinue = Boolean(
    name.trim() &&
      text.trim().length >= 10 &&
      detected === fields.length &&
      !submitting,
  );

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
    const placementCount = Number(values.placements);
    const deadline = parseDeadlineInput(values.deadline);
    const budget = values.budget.trim().replace(/^\$/, "");

    if (name.trim().length < 2) {
      errors.name = "Give the campaign a name of at least two characters.";
    }
    if (text.trim().length < 10) {
      errors.brief = "Describe the campaign in a full sentence.";
    }
    if (!Number.isInteger(placementCount) || placementCount < 1) {
      errors.placements = "Enter a whole number of placements.";
    }
    if (!values.city.trim()) {
      errors.city = "Enter the city this campaign runs in.";
    }
    if (!values.countryName.trim()) {
      errors.countryName = "Enter the country this campaign runs in.";
    }
    if (!deadline) {
      errors.deadline = "Use a future date, time, or a phrase like ‘tomorrow’.";
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(budget)) {
      errors.budget = "Enter a positive amount with up to two decimals.";
    }

    // The country code is resolved from the gazetteer. If a brand types a
    // country we do not know, the map step will establish it precisely.
    const place =
      findPlaceByCity(values.city) ??
      (parsed.countryCode
        ? {
            countryCode: parsed.countryCode,
            countryName: parsed.countryName,
          }
        : null);

    if (Object.keys(errors).length > 0 || !deadline) {
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
        deadline: deadline.toISOString(),
        city: values.city.trim(),
        countryCode: place?.countryCode ?? "",
        countryName: values.countryName.trim(),
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
          <span className="text-[13px] text-faint">
            {detected} of {fields.length} details found
          </span>
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
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">
            Detected details
          </h2>
          <p className="text-[13px] text-muted">
            Correct anything we misread. You will choose the exact area on the map next.
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

        <div className="grid gap-px bg-line sm:grid-cols-2">
          {fields.map((field) => {
            const value = values[field.key];
            const auto = Boolean(
              parsed[field.key === "placements" ? "placements" : field.key] &&
                edits[field.key] === undefined,
            );

            return (
              <label
                key={field.key}
                className="flex flex-col gap-1.5 bg-surface px-6 py-4"
              >
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
                  <span className="text-[12px] text-fail">
                    {fieldErrors[field.key]}
                  </span>
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
