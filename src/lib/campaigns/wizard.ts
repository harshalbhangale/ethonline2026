import type { CampaignWizardStepValue } from "@/lib/campaigns/types";

export const wizardStepOrder: CampaignWizardStepValue[] = [
  "BRIEF",
  "LOCATION",
  "PLACEMENTS",
  "CREATIVE",
  "REVIEW",
];

const slugByStep: Record<CampaignWizardStepValue, string> = {
  BRIEF: "brief",
  LOCATION: "location",
  PLACEMENTS: "placements",
  CREATIVE: "creative",
  REVIEW: "review",
};

const stepBySlug = new Map<string, CampaignWizardStepValue>(
  wizardStepOrder.map((step) => [slugByStep[step], step]),
);

/**
 * What the brand sees, as opposed to what is recorded.
 *
 * Choosing a city and drawing an area are one decision — "where" — so they
 * present as a single numbered stage. They stay two values in the database
 * because drafts are already saved against them, and renaming an enum a brand's
 * in-flight campaign points at would strand it.
 */
export type WizardStage = "BRIEF" | "WHERE" | "CREATIVE" | "REVIEW";

export const wizardStages: WizardStage[] = [
  "BRIEF",
  "WHERE",
  "CREATIVE",
  "REVIEW",
];

const stageByStep: Record<CampaignWizardStepValue, WizardStage> = {
  BRIEF: "BRIEF",
  LOCATION: "WHERE",
  PLACEMENTS: "WHERE",
  CREATIVE: "CREATIVE",
  REVIEW: "REVIEW",
};

export function stageFromStep(step: CampaignWizardStepValue): WizardStage {
  return stageByStep[step];
}

export const wizardStageTitles: Record<
  WizardStage,
  { title: string; sub: string }
> = {
  BRIEF: {
    title: "Describe the campaign",
    sub: "One sentence. Correct anything we misread.",
  },
  WHERE: {
    title: "Where it runs",
    sub: "Pick a city, set the area, and choose the surfaces we can use.",
  },
  CREATIVE: {
    title: "Artwork and destination",
    sub: "Upload your artwork and set where scans should go.",
  },
  REVIEW: {
    title: "Review and fund",
    sub: "Check the quote and confirm the campaign.",
  },
};

export function slugFromStep(step: CampaignWizardStepValue) {
  return slugByStep[step];
}

export function stepFromSlug(
  slug: string | null | undefined,
): CampaignWizardStepValue | null {
  if (!slug) return null;
  return stepBySlug.get(slug.toLowerCase()) ?? null;
}

/** One-based position of the visible stage, for "Step 2 of 4". */
export function stageNumber(step: CampaignWizardStepValue) {
  return wizardStages.indexOf(stageFromStep(step)) + 1;
}

export function nextStep(
  step: CampaignWizardStepValue,
): CampaignWizardStepValue | null {
  return wizardStepOrder[wizardStepOrder.indexOf(step) + 1] ?? null;
}

export function previousStep(
  step: CampaignWizardStepValue,
): CampaignWizardStepValue | null {
  return wizardStepOrder[wizardStepOrder.indexOf(step) - 1] ?? null;
}

/**
 * The furthest step a draft may open.
 *
 * A brand can revisit earlier steps freely but cannot skip ahead of the
 * progress the server has recorded.
 */
export function furthestAllowedStep(
  recordedStep: CampaignWizardStepValue,
): CampaignWizardStepValue {
  return recordedStep;
}

export function isStepReachable(
  step: CampaignWizardStepValue,
  recordedStep: CampaignWizardStepValue,
) {
  return wizardStepOrder.indexOf(step) <= wizardStepOrder.indexOf(recordedStep);
}
