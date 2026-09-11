"use client";

import { usePrivy } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ApprovedLocationPins from "@/components/campaigns/wizard/map/ApprovedLocationPins";
import { areaColor } from "@/components/campaigns/wizard/map/CampaignRadius";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import { formatCampaignBudget } from "@/lib/campaigns/format";
import { formatRadius } from "@/lib/campaigns/geo";
import { isMapConfigured } from "@/lib/campaigns/mapbox";
import {
  estimateDeploymentMinutes,
  estimateLocalFulfilmentMinor,
} from "@/lib/campaigns/pricing";
import {
  assetTypeOptions,
  type AssetTypeValue,
  type CampaignDto,
  type LocationStrategyValue,
} from "@/lib/campaigns/types";
import type { AvailableLocationsResponse } from "@/lib/locations/types";

const MapboxGlobe = dynamic(
  () => import("@/components/campaigns/wizard/map/MapboxGlobe"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-raised">
        <span className="text-[13px] font-semibold text-muted">
          Loading the map…
        </span>
      </div>
    ),
  },
);

const CampaignRadius = dynamic(
  () => import("@/components/campaigns/wizard/map/CampaignRadius"),
  { ssr: false },
);

const radiusChoices = [500, 1_000, 1_500, 3_000, 5_000];
const maxAreas = 6;

type DraftArea = {
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
};

function minorToDisplay(minor: number) {
  return (minor / 100).toFixed(2);
}

export default function PlacementAreaStep({
  campaign,
  submitting,
  onContinue,
}: {
  campaign: CampaignDto;
  submitting: boolean;
  onContinue: (input: {
    areas: DraftArea[];
    strategy: LocationStrategyValue;
    assetType: AssetTypeValue;
    locationIds: string[];
  }) => Promise<void>;
}) {
  const { getAccessToken } = usePrivy();

  const [areas, setAreas] = useState<DraftArea[]>(() =>
    campaign.centerLatitude !== null && campaign.centerLongitude !== null
      ? [
          {
            label: campaign.city ?? "Campaign centre",
            latitude: campaign.centerLatitude,
            longitude: campaign.centerLongitude,
            radiusMetres: campaign.radiusMeters ?? 1_500,
          },
        ]
      : [],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [addingArea, setAddingArea] = useState(false);
  const [strategy, setStrategy] = useState<LocationStrategyValue>(
    campaign.locationStrategy ?? "AUTO_APPROVED",
  );
  const [assetType, setAssetType] = useState<AssetTypeValue>(
    campaign.assetType ?? "QR_NORMAL",
  );
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [availability, setAvailability] =
    useState<AvailableLocationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  // Only the geometry matters for availability, so the effect keys off a
  // serialised form. The ref keeps the callback reading current areas without
  // making its identity change on every keystroke.
  const areasKey = useMemo(
    () =>
      areas
        .map((a) => `${a.latitude}:${a.longitude}:${a.radiusMetres}`)
        .join("|"),
    [areas],
  );
  const areasRef = useRef(areas);
  areasRef.current = areas;

  const loadAvailability = useCallback(async () => {
    const areas = areasRef.current;

    if (areas.length === 0) {
      setAvailability(null);
      setLoading(false);
      return;
    }

    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch<AvailableLocationsResponse>(
        getAccessToken,
        "/api/locations/available",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id, areas }),
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setAvailability(response);
      setManualIds((previous) => {
        const allowed = new Set(
          response.locations
            .filter((location) => location.hasCapacity)
            .map((location) => location.id),
        );
        const preserved = [...previous].filter((id) => allowed.has(id));
        const preselected = response.locations
          .filter((location) => location.selected && location.hasCapacity)
          .map((location) => location.id);

        return new Set(preserved.length > 0 ? preserved : preselected);
      });
      setLoading(false);
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not load approved locations.",
      );
      setLoading(false);
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [campaign.id, getAccessToken]);

  useEffect(() => {
    // Dragging a radius slider changes areasKey on every step, so settle first.
    const timer = window.setTimeout(() => void loadAvailability(), 250);

    return () => {
      window.clearTimeout(timer);
      cancelRequest();
    };
  }, [areasKey, loadAvailability, cancelRequest]);

  const withCapacity =
    availability?.locations.filter((location) => location.hasCapacity) ?? [];
  const availableCount = withCapacity.length;
  const requested = campaign.placementCount ?? 0;
  const selectedCount =
    strategy === "AUTO_APPROVED"
      ? Math.min(requested || availableCount, availableCount)
      : manualIds.size;

  const fulfilmentMinor = estimateLocalFulfilmentMinor(selectedCount, assetType);
  const deploymentMinutes = estimateDeploymentMinutes(selectedCount);
  const shortfall = requested > 0 && availableCount < requested;
  const canContinue =
    !submitting &&
    !loading &&
    areas.length > 0 &&
    availableCount > 0 &&
    (strategy === "AUTO_APPROVED" || manualIds.size > 0);

  function updateArea(index: number, patch: Partial<DraftArea>) {
    setAreas((previous) =>
      previous.map((area, position) =>
        position === index ? { ...area, ...patch } : area,
      ),
    );
  }

  function removeArea(index: number) {
    setAreas((previous) => previous.filter((_, position) => position !== index));
    setActiveIndex((previous) => Math.max(0, previous - (index <= previous ? 1 : 0)));
  }

  function addAreaAt(point: { latitude: number; longitude: number }) {
    if (areas.length >= maxAreas) return;

    setAreas((previous) => [
      ...previous,
      {
        label: `Area ${previous.length + 1}`,
        latitude: point.latitude,
        longitude: point.longitude,
        radiusMetres: previous.at(-1)?.radiusMetres ?? 1_500,
      },
    ]);
    setActiveIndex(areas.length);
    setAddingArea(false);
  }

  function toggleLocation(locationId: string) {
    if (strategy !== "MANUAL_SELECTION") return;

    setManualIds((previous) => {
      const next = new Set(previous);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }

  async function submit() {
    setSaveError(null);

    try {
      await onContinue({
        areas,
        strategy,
        assetType,
        locationIds: strategy === "MANUAL_SELECTION" ? [...manualIds] : [],
      });
    } catch (caught) {
      setSaveError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not save your campaign areas. Please try again.",
      );
    }
  }

  if (areas.length === 0 && campaign.centerLatitude === null) {
    return (
      <Card className="px-6 py-10 text-center">
        <h2 className="text-[18px] font-bold">Choose a location first</h2>
        <p className="mt-2 text-[13.5px] text-muted">
          Go back one step and pick the city this campaign should run in.
        </p>
      </Card>
    );
  }

  const areaCounts = availability?.areas ?? [];

  const controls = (
    <div className="flex h-full flex-col">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">
            Areas in {campaign.city}
          </h2>
          <span className="text-[11.5px] text-faint">
            {areas.length} of {maxAreas}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Target several neighbourhoods at once. Each is highlighted on the map.
        </p>
      </div>

      <div className="mt-3.5 space-y-2.5">
        {areas.map((area, index) => {
          const count = areaCounts[index]?.availableCount;
          const active = activeIndex === index;

          return (
            <div
              key={`${area.label}-${index}`}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                active ? "border-muted bg-raised" : "border-line"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  style={{ backgroundColor: areaColor(index) }}
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                />
                <input
                  value={area.label}
                  onChange={(event) =>
                    updateArea(index, { label: event.target.value })
                  }
                  aria-label={`Area ${index + 1} name`}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold outline-none"
                />
                {areas.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeArea(index)}
                    aria-label={`Remove ${area.label}`}
                    className="shrink-0 rounded-md px-1 text-[15px] leading-none text-faint hover:text-fail"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={radiusChoices[0]}
                  max={radiusChoices[radiusChoices.length - 1]}
                  step={100}
                  value={area.radiusMetres}
                  onChange={(event) =>
                    updateArea(index, {
                      radiusMetres: Number(event.target.value),
                    })
                  }
                  aria-label={`${area.label} radius`}
                  className="h-1 flex-1 accent-[color:var(--badge,#6ea8fe)]"
                />
                <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                  {formatRadius(area.radiusMetres)}
                </span>
              </div>

              <p className="mt-1.5 text-[11.5px] text-faint">
                {loading
                  ? "Checking…"
                  : count === undefined
                    ? "—"
                    : `${count} approved ${count === 1 ? "surface" : "surfaces"}`}
              </p>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={areas.length >= maxAreas}
        onClick={() => setAddingArea((value) => !value)}
        className={`mt-2.5 h-9 rounded-xl border border-dashed text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          addingArea
            ? "border-badge text-badge"
            : "border-line text-muted hover:text-ink"
        }`}
      >
        {areas.length >= maxAreas
          ? "Area limit reached"
          : addingArea
            ? "Click the map to place it"
            : "+ Add another area"}
      </button>

      <fieldset className="mt-4 border-t border-line pt-3.5">
        <legend className="text-[12px] font-semibold text-muted">
          Asset type
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {assetTypeOptions.map((option) => (
            <label
              key={option.value}
              title={option.description}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                assetType === option.value
                  ? "border-badge bg-raised"
                  : "border-line hover:border-muted"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">
                  {option.emoji} {option.label}
                </span>
                <input
                  type="radio"
                  name="asset-type"
                  className="sr-only"
                  value={option.value}
                  checked={assetType === option.value}
                  onChange={() => setAssetType(option.value)}
                />
              </span>
              <span className="text-[11px] font-semibold text-faint">
                {option.priceLabel} price
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 border-t border-line pt-3.5">
        <legend className="text-[12px] font-semibold text-muted">
          Choosing surfaces
        </legend>
        <div className="mt-2 space-y-1.5">
          {(
            [
              ["AUTO_APPROVED", "Let StickerBomb choose"],
              ["MANUAL_SELECTION", "Pick pins myself"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                strategy === value ? "border-badge bg-raised" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="location-strategy"
                value={value}
                checked={strategy === value}
                onChange={() => setStrategy(value)}
              />
              <span className="text-[13px] font-semibold">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 border-t border-line pt-3.5">
        {error ? (
          <div>
            <p className="text-[12.5px] text-fail">{error}</p>
            <button
              type="button"
              onClick={() => void loadAvailability()}
              className="mt-2 h-9 rounded-xl border border-line px-3 text-[12.5px] font-semibold hover:bg-raised"
            >
              Try again
            </button>
          </div>
        ) : (
          <dl className="space-y-1.5 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Requested</dt>
              <dd className="font-semibold">{requested || "Not set"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Available across areas</dt>
              <dd className="font-semibold">{loading ? "…" : availableCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Deployment time</dt>
              <dd className="font-semibold">
                {selectedCount > 0 ? `${deploymentMinutes} min` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Local fulfilment</dt>
              <dd className="font-semibold">
                {selectedCount > 0
                  ? formatCampaignBudget(
                      minorToDisplay(fulfilmentMinor),
                      campaign.currency,
                    )
                  : "—"}
              </dd>
            </div>
          </dl>
        )}

        {!loading && !error && availableCount === 0 ? (
          <p className="mt-2.5 rounded-xl border border-fail/25 bg-fail/5 px-3 py-2 text-[12px] leading-relaxed text-fail">
            No approved locations in these areas yet. Widen a radius, move an
            area, or add another.
          </p>
        ) : null}

        {!loading && !error && shortfall && availableCount > 0 ? (
          <p className="mt-2.5 rounded-xl border border-line bg-raised px-3 py-2 text-[12px] leading-relaxed text-muted">
            {availableCount} of {requested} requested placements can be filled.
            Add an area to reach more.
          </p>
        ) : null}
      </div>

      <div className="mt-auto pt-4">
        {saveError ? (
          <p className="mb-2 text-[12.5px] text-fail">{saveError}</p>
        ) : null}
        <p className="mb-2.5 text-[11px] leading-relaxed text-faint">
          You choose the areas. StickerBomb assigns the exact surface, revealed
          to a worker only after they accept the job.
        </p>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => void submit()}
          className="h-11 w-full rounded-xl bg-solid text-[14px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {submitting ? "Saving…" : "Continue to artwork"}
        </button>
      </div>
    </div>
  );

  if (!isMapConfigured) {
    return (
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="p-5">{controls}</Card>
        <Card className="px-6 py-10">
          <h2 className="text-[17px] font-bold">Map is not configured</h2>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            Highlighted areas and pins need a Mapbox token. The availability
            counts are still accurate, and the approved locations in range are
            listed below.
          </p>
          {availability ? (
            <ul className="mt-5 space-y-2">
              {availability.locations.map((location) => (
                <li
                  key={location.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-[13px]"
                >
                  <span className="truncate font-semibold">
                    {location.venueName}
                  </span>
                  <span className="shrink-0 text-[12px] text-faint">
                    {location.hasCapacity
                      ? `${location.distanceMetres} m`
                      : "At capacity"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="p-5">{controls}</Card>

      <div className="relative h-[440px] overflow-hidden rounded-[20px] border border-line lg:h-[calc(min(100vh,960px)-300px)] lg:min-h-[440px]">
        <MapboxGlobe
          spin={false}
          cursor={addingArea ? "crosshair" : undefined}
          onMapClick={addingArea ? addAreaAt : undefined}
          initialView={{
            latitude: areas[0]?.latitude ?? campaign.centerLatitude ?? 0,
            longitude: areas[0]?.longitude ?? campaign.centerLongitude ?? 0,
            zoom: 12,
            pitch: 30,
          }}
          fitAreas={areas.map((area) => ({
            latitude: area.latitude,
            longitude: area.longitude,
            radiusMetres: area.radiusMetres,
          }))}
        >
          <CampaignRadius areas={areas} activeIndex={activeIndex} />
          <ApprovedLocationPins
            locations={availability?.locations ?? []}
            selectedIds={
              strategy === "MANUAL_SELECTION"
                ? manualIds
                : new Set(
                    withCapacity
                      .slice(0, selectedCount)
                      .map((location) => location.id),
                  )
            }
            interactive={strategy === "MANUAL_SELECTION"}
            onToggle={toggleLocation}
          />
        </MapboxGlobe>

        {addingArea ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
            <p className="rounded-full border border-badge/50 bg-bg/95 px-4 py-2 text-[12.5px] font-semibold text-badge backdrop-blur-md">
              Click anywhere on the map to add an area
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
