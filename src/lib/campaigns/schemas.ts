import { z } from "zod";
import { normalizeCampaignDestination } from "@/lib/campaigns/destination";

function normalizeDestination(value: string, context: z.RefinementCtx) {
  const normalized = normalizeCampaignDestination(value);

  if (normalized) return normalized;

  context.addIssue({
    code: "custom",
    message:
      "Enter an http or https URL with a qualified hostname, such as brand.com.",
  });
  return z.NEVER;
}

function toMinorUnits(value: string, context: z.RefinementCtx) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) {
    context.addIssue({
      code: "custom",
      message: "Enter a budget between 0.01 and 9,999,999.99.",
    });
    return z.NEVER;
  }

  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));

  if (minor < BigInt(1)) {
    context.addIssue({ code: "custom", message: "Budget must be positive." });
    return z.NEVER;
  }

  return minor;
}

const name = z.string().trim().min(2).max(160);
const briefText = z.string().trim().min(10).max(5_000);
const placementCount = z.coerce.number().int().min(1).max(1_000);
const budgetLimit = z
  .union([z.string(), z.number().finite().nonnegative()])
  .transform((value) => String(value).trim())
  .transform(toMinorUnits);
const currency = z.enum(["USD", "USDC"]);
const destinationUrl = z
  .string()
  .trim()
  .min(3)
  .max(2_048)
  .transform(normalizeDestination);
const deadline = z
  .string()
  .trim()
  .transform((value, context) => {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid deadline." });
      return z.NEVER;
    }

    if (parsed <= new Date()) {
      context.addIssue({
        code: "custom",
        message: "Deadline must be in the future.",
      });
      return z.NEVER;
    }

    return parsed;
  });

const countryCode = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter ISO country code.")
  .transform((value) => value.toUpperCase());
const countryName = z.string().trim().min(2).max(120);
const city = z.string().trim().min(1).max(160);
const centerLatitude = z.coerce.number().min(-90).max(90);
const centerLongitude = z.coerce.number().min(-180).max(180);
const radiusMeters = z.coerce.number().int().min(100).max(50_000);
const locationStrategy = z.enum(["AUTO_APPROVED", "MANUAL_SELECTION"]);
const wizardStep = z.enum([
  "BRIEF",
  "LOCATION",
  "PLACEMENTS",
  "CREATIVE",
  "REVIEW",
]);

/**
 * Step 1 of the wizard. Only the brief itself is required; every other value is
 * collected or corrected in later steps.
 *
 * `areaLabel` is deliberately absent. It is derived server-side from structured
 * geography so it can never become an independent source of truth.
 */
export const campaignCreateSchema = z.object({
  name,
  briefText,
  currency: currency.default("USD"),
  placementCount: placementCount.optional(),
  budgetLimit: budgetLimit.optional(),
  destinationUrl: destinationUrl.optional(),
  deadline: deadline.optional(),
  countryCode: countryCode.optional(),
  countryName: countryName.optional(),
  city: city.optional(),
  /** Wizard progress only. It confers no authorization. */
  wizardStep: wizardStep.optional(),
});

export const campaignUpdateSchema = z
  .object({
    name: name.optional(),
    briefText: briefText.optional(),
    placementCount: placementCount.optional(),
    budgetLimit: budgetLimit.optional(),
    currency: currency.optional(),
    destinationUrl: destinationUrl.optional(),
    deadline: deadline.optional(),
    countryCode: countryCode.optional(),
    countryName: countryName.optional(),
    city: city.optional(),
    centerLatitude: centerLatitude.optional(),
    centerLongitude: centerLongitude.optional(),
    radiusMeters: radiusMeters.optional(),
    locationStrategy: locationStrategy.optional(),
    wizardStep: wizardStep.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one campaign field to update.",
  })
  .refine(
    (value) =>
      (value.centerLatitude === undefined) ===
      (value.centerLongitude === undefined),
    {
      message: "Provide both a centre latitude and longitude, or neither.",
      path: ["centerLatitude"],
    },
  );

/**
 * The DRAFT -> QUOTED trust boundary.
 *
 * The database no longer guarantees a campaign is complete, so this is the only
 * remaining invariant. Every field a quote, worker or payout depends on must be
 * proven present here.
 */
export const campaignQuoteReadySchema = z.object({
  placementCount: z.number().int().min(1).max(1_000),
  budgetLimitMinor: z.bigint().positive(),
  destinationUrl: z.string().min(3),
  deadline: z.date(),
  countryCode: z.string().length(2),
  countryName: z.string().min(2),
  city: z.string().min(1),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(100).max(50_000),
  locationStrategy: locationStrategy,
});

export type CampaignCreateInput = z.output<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.output<typeof campaignUpdateSchema>;
export type CampaignQuoteReadyInput = z.output<typeof campaignQuoteReadySchema>;
