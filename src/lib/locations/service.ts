import {
  AssetType,
  CampaignStatus,
  LocationPermissionStatus,
  Prisma,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { distanceInMetres, radiusChoices } from "@/lib/campaigns/geo";
import { buildAreaLabel } from "@/lib/campaigns/service";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type {
  AvailableLocationDto,
  AvailableLocationsResponse,
} from "@/lib/locations/types";

/**
 * Campaign states that hold a venue's capacity.
 *
 * Drafts and unapproved quotes deliberately do not reserve inventory, so an
 * abandoned draft cannot block a real campaign. The trade-off is that capacity
 * is only truly claimed at funding, which is where it must be re-checked.
 */
export const capacityHoldingStatuses: CampaignStatus[] = [
  CampaignStatus.FUNDED,
  CampaignStatus.ASSETS_READY,
  CampaignStatus.DEPLOYING,
  CampaignStatus.VERIFYING,
  CampaignStatus.LIVE,
  CampaignStatus.REMOVING,
];

type AvailabilityRow = {
  id: string;
  venue_name: string;
  city: string;
  country_code: string;
  country_name: string;
  latitude: number;
  longitude: number;
  distance_metres: number;
  placement_instructions: string;
  max_active_campaigns: number;
  active_campaigns: bigint;
  selected: boolean;
};

export type CampaignAreaInput = {
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
};

/**
 * Approved locations inside any of a campaign's areas.
 *
 * A campaign can target several neighbourhoods, so the result is the union
 * across areas. Each location is attributed to the nearest area that contains
 * it, and a venue reachable from two overlapping areas is still counted once.
 */
export async function findAvailableLocationsForAreas({
  areas,
  campaignId,
}: {
  areas: CampaignAreaInput[];
  campaignId: string | null;
}): Promise<AvailableLocationsResponse> {
  if (areas.length === 0) {
    return {
      centre: null,
      radiusMetres: 0,
      areas: [],
      availableCount: 0,
      locations: [],
    };
  }

  const perArea = await Promise.all(
    areas.map((area) =>
      findAvailableLocations({
        centreLatitude: area.latitude,
        centreLongitude: area.longitude,
        radiusMetres: area.radiusMetres,
        campaignId,
      }),
    ),
  );

  const merged = new Map<string, AvailableLocationDto>();

  perArea.forEach((result, index) => {
    for (const location of result.locations) {
      const existing = merged.get(location.id);

      // Keep whichever area the venue sits closest to.
      if (!existing || location.distanceMetres < existing.distanceMetres) {
        merged.set(location.id, {
          ...location,
          areaLabel: areas[index].label,
          areaIndex: index,
        });
      }
    }
  });

  const locations = [...merged.values()].sort(
    (a, b) => a.distanceMetres - b.distanceMetres,
  );

  return {
    centre: { latitude: areas[0].latitude, longitude: areas[0].longitude },
    radiusMetres: areas[0].radiusMetres,
    areas: areas.map((area, index) => ({
      label: area.label,
      latitude: area.latitude,
      longitude: area.longitude,
      radiusMetres: area.radiusMetres,
      availableCount: perArea[index].locations.filter(
        (location) => location.hasCapacity,
      ).length,
    })),
    availableCount: locations.filter((location) => location.hasCapacity).length,
    locations,
  };
}

export async function findAvailableLocations({
  centreLatitude,
  centreLongitude,
  radiusMetres,
  campaignId,
}: {
  centreLatitude: number;
  centreLongitude: number;
  radiusMetres: number;
  campaignId: string | null;
}): Promise<AvailableLocationsResponse> {
  const prisma = getPrismaClient();

  // Haversine mirrors distanceInMetres() in lib/campaigns/geo.ts. Keep both in
  // step if the formula ever changes.
  const rows = await prisma.$queryRaw<AvailabilityRow[]>(Prisma.sql`
    SELECT
      l.id,
      l.venue_name,
      l.city,
      l.country_code,
      l.country_name,
      l.latitude,
      l.longitude,
      l.placement_instructions,
      l.max_active_campaigns,
      6371000 * 2 * asin(sqrt(
        power(sin(radians(l.latitude - ${centreLatitude}) / 2), 2)
        + cos(radians(${centreLatitude})) * cos(radians(l.latitude))
        * power(sin(radians(l.longitude - ${centreLongitude}) / 2), 2)
      )) AS distance_metres,
      COALESCE((
        SELECT COUNT(*)
          FROM campaign_locations cl
          JOIN campaigns c ON c.id = cl.campaign_id
         WHERE cl.location_id = l.id
           AND c.status::text IN (${Prisma.join(
             capacityHoldingStatuses.map((status) => status.toString()),
           )})
           AND (${campaignId}::text IS NULL OR c.id <> ${campaignId})
      ), 0) AS active_campaigns,
      EXISTS (
        SELECT 1
          FROM campaign_locations cl2
         WHERE cl2.location_id = l.id
           AND cl2.campaign_id = ${campaignId}
      ) AS selected
    FROM locations l
    WHERE l.permission_status = 'APPROVED'
      AND 6371000 * 2 * asin(sqrt(
            power(sin(radians(l.latitude - ${centreLatitude}) / 2), 2)
            + cos(radians(${centreLatitude})) * cos(radians(l.latitude))
            * power(sin(radians(l.longitude - ${centreLongitude}) / 2), 2)
          )) <= ${radiusMetres}
    ORDER BY distance_metres ASC
  `);

  const locations: AvailableLocationDto[] = rows.map((row) => {
    const activeCampaigns = Number(row.active_campaigns);

    return {
      id: row.id,
      venueName: row.venue_name,
      city: row.city,
      countryCode: row.country_code,
      countryName: row.country_name,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceMetres: Math.round(row.distance_metres),
      placementInstructions: row.placement_instructions,
      maxActiveCampaigns: row.max_active_campaigns,
      activeCampaigns,
      hasCapacity: activeCampaigns < row.max_active_campaigns,
      selected: row.selected,
    };
  });

  return {
    centre: { latitude: centreLatitude, longitude: centreLongitude },
    radiusMetres,
    areas: [],
    availableCount: locations.filter((location) => location.hasCapacity).length,
    locations,
  };
}

/**
 * Replaces a draft campaign's areas.
 *
 * The first area is mirrored onto the campaign's own centre/radius columns so
 * the completeness check and worker dispatch keep one canonical centre.
 */
export async function setCampaignAreas(
  context: BrandContext,
  campaignId: string,
  areas: CampaignAreaInput[],
) {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_EDITABLE",
      "Only draft campaigns can change their areas.",
    );
  }

  if (areas.length === 0) {
    throw new ApiError(
      400,
      "AREA_REQUIRED",
      "Add at least one campaign area.",
    );
  }

  const [primary] = areas;

  await prisma.$transaction(async (transaction) => {
    await transaction.campaignArea.deleteMany({ where: { campaignId } });
    await transaction.campaignArea.createMany({
      data: areas.map((area, index) => ({
        campaignId,
        label: area.label,
        latitude: area.latitude,
        longitude: area.longitude,
        radiusMeters: area.radiusMetres,
        sortOrder: index,
      })),
    });
    await transaction.campaign.update({
      where: { id: campaignId },
      data: {
        centerLatitude: primary.latitude,
        centerLongitude: primary.longitude,
        radiusMeters: primary.radiusMetres,
      },
    });
  });

  return { areas };
}

export async function getCampaignAreas(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignAreaInput[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.campaignArea.findMany({
    where: { campaignId, campaign: { organizationId: context.organizationId } },
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((row) => ({
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radiusMeters,
  }));
}

/**
 * Replaces a draft campaign's location selection.
 *
 * Automatic selection takes the nearest locations with capacity. Manual
 * selection is validated against the same availability query, so a client can
 * never attach an unapproved, out-of-radius or full venue.
 */
export async function setCampaignLocations(
  context: BrandContext,
  campaignId: string,
  {
    strategy,
    locationIds,
  }: {
    strategy: "AUTO_APPROVED" | "MANUAL_SELECTION";
    locationIds: string[];
  },
) {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_EDITABLE",
      "Only draft campaigns can change their locations.",
    );
  }

  // Validate against every stored area, not just the primary one, or a venue
  // legitimately inside a second area would be rejected.
  const storedAreas = await prisma.campaignArea.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });

  const areas: CampaignAreaInput[] =
    storedAreas.length > 0
      ? storedAreas.map((area) => ({
          label: area.label,
          latitude: area.latitude,
          longitude: area.longitude,
          radiusMetres: area.radiusMeters,
        }))
      : campaign.centerLatitude !== null &&
          campaign.centerLongitude !== null &&
          campaign.radiusMeters !== null
        ? [
            {
              label: campaign.city ?? "Campaign centre",
              latitude: campaign.centerLatitude,
              longitude: campaign.centerLongitude,
              radiusMetres: campaign.radiusMeters,
            },
          ]
        : [];

  if (areas.length === 0) {
    throw new ApiError(
      409,
      "CAMPAIGN_AREA_REQUIRED",
      "Choose a campaign area before selecting locations.",
    );
  }

  const availability = await findAvailableLocationsForAreas({
    areas,
    campaignId,
  });

  const selectable = availability.locations.filter(
    (location) => location.hasCapacity,
  );

  if (selectable.length === 0) {
    throw new ApiError(
      409,
      "NO_APPROVED_LOCATIONS",
      "No approved locations are available in this area yet.",
    );
  }

  const placementCount = campaign.placementCount ?? selectable.length;

  let chosen: string[];

  if (strategy === "AUTO_APPROVED") {
    // Nearest first, capped at the requested placement count.
    chosen = selectable.slice(0, placementCount).map((location) => location.id);
  } else {
    const allowed = new Set(selectable.map((location) => location.id));
    const invalid = locationIds.filter((id) => !allowed.has(id));

    if (invalid.length > 0) {
      throw new ApiError(
        409,
        "LOCATION_UNAVAILABLE",
        "One or more selected locations are outside the area or already full.",
      );
    }

    if (locationIds.length === 0) {
      throw new ApiError(
        400,
        "LOCATION_REQUIRED",
        "Select at least one approved location.",
      );
    }

    chosen = [...new Set(locationIds)];
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.campaignLocation.deleteMany({ where: { campaignId } });
    await transaction.campaignLocation.createMany({
      data: chosen.map((locationId) => ({
        campaignId,
        locationId,
        source: strategy === "AUTO_APPROVED" ? "SYSTEM" : "BRAND",
      })),
    });
    await transaction.campaign.update({
      where: { id: campaignId },
      data: { locationStrategy: strategy },
    });
  });

  return { selectedLocationIds: chosen };
}

export async function getCampaignLocationIds(
  context: BrandContext,
  campaignId: string,
) {
  const prisma = getPrismaClient();
  const rows = await prisma.campaignLocation.findMany({
    where: { campaignId, campaign: { organizationId: context.organizationId } },
    select: { locationId: true },
  });

  return rows.map((row) => row.locationId);
}

/**
 * Saves the whole placement step in one request: areas, location strategy,
 * the chosen approved locations and the wizard's progress.
 *
 * The wizard used to send four requests in sequence for this, each one
 * re-authenticating and re-reading the campaign. Locations are validated
 * against the areas being saved, so nothing has to be stored first.
 */
export async function saveCampaignPlacementPlan(
  context: BrandContext,
  campaignId: string,
  {
    areas,
    strategy,
    assetType,
    locationIds,
  }: {
    areas: CampaignAreaInput[];
    strategy: "AUTO_APPROVED" | "MANUAL_SELECTION";
    assetType?: AssetType;
    locationIds: string[];
  },
) {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true, status: true, placementCount: true, city: true, countryName: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_EDITABLE",
      "Only draft campaigns can change their placements.",
    );
  }

  if (areas.length === 0) {
    throw new ApiError(400, "AREA_REQUIRED", "Add at least one campaign area.");
  }

  const availability = await findAvailableLocationsForAreas({ areas, campaignId });
  const selectable = availability.locations.filter((location) => location.hasCapacity);

  if (selectable.length === 0) {
    throw new ApiError(
      409,
      "NO_APPROVED_LOCATIONS",
      "No approved locations are available in these areas yet.",
    );
  }

  let chosen: string[];
  if (strategy === "AUTO_APPROVED") {
    // Nearest first, capped at the requested placement count.
    chosen = selectable
      .slice(0, campaign.placementCount ?? selectable.length)
      .map((location) => location.id);
  } else {
    const allowed = new Set(selectable.map((location) => location.id));
    if (locationIds.length === 0) {
      throw new ApiError(400, "LOCATION_REQUIRED", "Select at least one approved location.");
    }
    if (locationIds.some((id) => !allowed.has(id))) {
      throw new ApiError(
        409,
        "LOCATION_UNAVAILABLE",
        "One or more selected locations are outside the area or already full.",
      );
    }
    chosen = [...new Set(locationIds)];
  }

  const [primary] = areas;

  await prisma.$transaction(async (transaction) => {
    await transaction.campaignArea.deleteMany({ where: { campaignId } });
    await transaction.campaignArea.createMany({
      data: areas.map((area, index) => ({
        campaignId,
        label: area.label,
        latitude: area.latitude,
        longitude: area.longitude,
        radiusMeters: area.radiusMetres,
        sortOrder: index,
      })),
    });
    await transaction.campaignLocation.deleteMany({ where: { campaignId } });
    await transaction.campaignLocation.createMany({
      data: chosen.map((locationId) => ({
        campaignId,
        locationId,
        source: strategy === "AUTO_APPROVED" ? "SYSTEM" : "BRAND",
      })),
    });
    await transaction.campaign.update({
      where: { id: campaignId },
      data: {
        centerLatitude: primary.latitude,
        centerLongitude: primary.longitude,
        radiusMeters: primary.radiusMetres,
        areaLabel: buildAreaLabel({
          city: campaign.city,
          countryName: campaign.countryName,
          radiusMeters: primary.radiusMetres,
        }),
        locationStrategy: strategy,
        ...(assetType ? { assetType } : {}),
        wizardStep: "CREATIVE",
      },
    });
  });

  return { selectedLocationIds: chosen };
}

export type ServiceableCity = {
  city: string;
  countryCode: string;
  countryName: string;
  /** Centre of the city's approved surfaces, not the city's geographic centre. */
  latitude: number;
  longitude: number;
  locationCount: number;
  /** A radius that actually reaches this city's approved surfaces. */
  suggestedRadiusMetres: number;
};

function snapRadius(metres: number) {
  return radiusChoices.find((choice) => choice >= metres) ?? radiusChoices.at(-1)!;
}

/**
 * Cities the platform can actually service, centred on their real inventory.
 *
 * The brand should never be offered a city with nothing in it, and a city's
 * suggested centre has to be where its approved surfaces are: pointing at the
 * geographic centre of Bengaluru puts every surface in HSR Layout kilometres
 * outside the default radius.
 *
 * Grouping happens in memory because the approved set is small; if inventory
 * grows into the thousands this wants to become an aggregate query.
 */
let citiesCache: { at: number; cities: ServiceableCity[] } | null = null;
const CITIES_CACHE_MS = 5 * 60_000;

/** Inventory changes rarely, so the grouping is reused for a few minutes. */
export async function listServiceableCities(): Promise<ServiceableCity[]> {
  if (citiesCache && Date.now() - citiesCache.at < CITIES_CACHE_MS) return citiesCache.cities;
  const cities = await computeServiceableCities();
  citiesCache = { at: Date.now(), cities };
  return cities;
}

async function computeServiceableCities(): Promise<ServiceableCity[]> {
  const locations = await getPrismaClient().location.findMany({
    where: { permissionStatus: LocationPermissionStatus.APPROVED },
    select: {
      city: true,
      countryCode: true,
      countryName: true,
      latitude: true,
      longitude: true,
    },
  });

  const byCity = new Map<string, typeof locations>();
  for (const location of locations) {
    const key = `${location.city}|${location.countryCode}`;
    const group = byCity.get(key);
    if (group) group.push(location);
    else byCity.set(key, [location]);
  }

  const cities = [...byCity.values()].map((group): ServiceableCity => {
    const latitude =
      group.reduce((total, item) => total + item.latitude, 0) / group.length;
    const longitude =
      group.reduce((total, item) => total + item.longitude, 0) / group.length;

    // Reach the furthest surface, with headroom so it is not sitting on the rim.
    const furthest = Math.max(
      ...group.map((item) => distanceInMetres({ latitude, longitude }, item)),
    );

    return {
      city: group[0].city,
      countryCode: group[0].countryCode,
      countryName: group[0].countryName,
      latitude,
      longitude,
      locationCount: group.length,
      suggestedRadiusMetres: snapRadius(Math.max(1_000, furthest * 1.15)),
    };
  });

  // Most inventory first: the cities a brand is most likely to want.
  return cities.sort(
    (a, b) => b.locationCount - a.locationCount || a.city.localeCompare(b.city),
  );
}
