import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { getCampaign } from "@/lib/campaigns/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import {
  findAvailableLocations,
  findAvailableLocationsForAreas,
} from "@/lib/locations/service";
import { timed } from "@/lib/perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMetres: z.coerce.number().int().min(100).max(50_000),
  campaignId: z.string().min(1).optional(),
});

const areasSchema = z.object({
  campaignId: z.string().min(1).optional(),
  areas: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        radiusMetres: z.coerce.number().int().min(100).max(50_000),
      }),
    )
    .min(1)
    .max(12),
});

/** Single-area lookup, kept for simple queries. */
export async function GET(request: Request) {
  try {
    const context = await requireBrandContext(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      latitude: url.searchParams.get("latitude"),
      longitude: url.searchParams.get("longitude"),
      radiusMetres: url.searchParams.get("radiusMetres"),
      campaignId: url.searchParams.get("campaignId") ?? undefined,
    });

    if (query.campaignId) {
      await getCampaign(context, query.campaignId);
    }

    return Response.json(
      await findAvailableLocations({
        centreLatitude: query.latitude,
        centreLongitude: query.longitude,
        radiusMetres: query.radiusMetres,
        campaignId: query.campaignId ?? null,
      }),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Multi-area lookup.
 *
 * A POST is used because a campaign can target many neighbourhoods and the
 * area list does not belong in a query string. It reads only.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const context = await timed("available.POST requireBrandContext", () =>
      requireBrandContext(request),
    );
    const input = areasSchema.parse(await readJsonBody(request));

    if (input.campaignId) {
      await timed("available.POST getCampaign", () => getCampaign(context, input.campaignId!));
    }

    const result = await timed("available.POST findAvailableLocationsForAreas", () =>
      findAvailableLocationsForAreas({
        areas: input.areas,
        campaignId: input.campaignId ?? null,
      }),
    );
    console.log(`[timing] available.POST total ${Date.now() - startedAt}ms`);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
