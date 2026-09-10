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

export const wizardStepTitles: Record<
  CampaignWizardStepValue,
  { title: string; sub: string }
> = {
  BRIEF: {
    title: "Campaign brief",
    sub: "Describe the campaign in a sentence and correct anything we misread.",
  },
  LOCATION: {
    title: "Select location",
    sub: "Choose the country and city this campaign should run in.",
  },
  PLACEMENTS: {
    title: "Choose placements",
    sub: "Set the campaign area and confirm the approved locations we can use.",
  },
  CREATIVE: {
    title: "Campaign artwork",
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

/** One-based position, for "Step 2 of 5". */
export function stepNumber(step: CampaignWizardStepValue) {
  return wizardStepOrder.indexOf(step) + 1;
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
