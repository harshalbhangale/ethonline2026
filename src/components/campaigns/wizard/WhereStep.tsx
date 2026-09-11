"use client";

import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "motion/react";
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
import type { SelectedPlace } from "@/lib/campaigns/geo";
import { formatRadius, radiusChoices } from "@/lib/campaigns/geo";
import { isMapConfigured } from "@/lib/campaigns/mapbox";
import { knownPlaces } from "@/lib/campaigns/places";
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
import type {
  AvailableLocationDto,
  AvailableLocationsResponse,
} from "@/lib/locations/types";
import type { ServiceableCity } from "@/lib/locations/service";

// Mapbox GL touches window at import time and ships a large bundle: loaded
// only in the browser, once, and kept mounted across both phases below so
// picking a city and drawing an area feel like one continuous map rather
// than two separate loads.
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

const LocationSearch = dynamic(
  () => import("@/components/campaigns/wizard/map/LocationSearch"),
  {
    ssr: false,
    loading: () => (
      <div className="px-3 py-2.5 text-[13px] text-faint">Loading search…</div>
    ),
  },
);

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

/**
 * "Where it runs", as one screen instead of two.
 *
 * Choosing a city and drawing an area used to be sequential pages that
 * happened to share a step number — a brand would pick New York, click
 * Continue, and land on a second page that also opened with a map, which
 * read as "select a city" twice. Here the city panel simply swaps to the
 * area panel in place, on the same mounted map: one decision, one screen.
 */
export default function WhereStep({
  campaign,
  submitting,
  onChooseCity,
  onContinue,
}: {
  campaign: CampaignDto;
  submitting: boolean;
  onChooseCity: (place: SelectedPlace) => Promise<void>;
  onContinue: (input: {
    areas: DraftArea[];
    strategy: LocationStrategyValue;
    assetType: AssetTypeValue;
    locationIds: string[];
  }) => Promise<void>;
}) {
  const { getAccessToken } = usePrivy();

  // Which half of the screen is showing. Once a city is saved the campaign
  // carries centerLatitude, so a resumed draft opens straight on the area
  // panel — the map itself never had to reload to get there.
  const [phase, setPhase] = useState<"city" | "area">(
    campaign.centerLatitude !== null ? "area" : "city",
  );

  // ---- city phase -------------------------------------------------------

  const initialPlace = useMemo<SelectedPlace | null>(() => {
    if (
      campaign.city &&
      campaign.countryName &&
      campaign.centerLatitude !== null &&
      campaign.centerLongitude !== null
    ) {
      return {
        city: campaign.city,
        countryCode: campaign.countryCode ?? "",
        countryName: campaign.countryName,
        latitude: campaign.centerLatitude,
        longitude: campaign.centerLongitude,
      };
    }
    return null;
  }, [campaign]);

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(initialPlace);
  const [cityError, setCityError] = useState<string | null>(null);
  const [cities, setCities] = useState<ServiceableCity[]>([]);
  const [savingCity, setSavingCity] = useState(false);

  // Only cities with approved surfaces are offered, or the next screen opens
  // on nothing to place.
  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch<{ cities: ServiceableCity[] }>(getAccessToken, "/api/locations/cities")
      .then((response) => {
        if (!cancelled) setCities(response.cities);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  const briefHint =
    !selectedPlace && campaign.city
      ? knownPlaces.find((place) => place.city.toLowerCase() === campaign.city?.toLowerCase()) ?? null
      : null;

  function choosePlace(place: SelectedPlace) {
    setSelectedPlace(place);
    setCityError(null);
  }

  async function confirmCity() {
    if (!selectedPlace) return;
    setCityError(null);
    setSavingCity(true);

    try {
      await onChooseCity(selectedPlace);
      // The area panel opens with this city as its first area.
      setAreas([
        {
          label: selectedPlace.city,
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          radiusMetres: selectedPlace.suggestedRadiusMetres ?? 1_500,
        },
      ]);
      setPhase("area");
    } catch (caught) {
      setCityError(
        caught instanceof ClientApiError ? caught.message : "Could not save this location. Please try again.",
      );
    } finally {
      setSavingCity(false);
    }
  }

  // ---- area phase ---------------------------------------------------

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
  const [assetType, setAssetType] = useState<AssetTypeValue>(campaign.assetType ?? "QR_NORMAL");
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<AvailableLocationsResponse | null>(null);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const areasKey = useMemo(
    () => areas.map((a) => `${a.latitude}:${a.longitude}:${a.radiusMetres}`).join("|"),
    [areas],
  );
  const areasRef = useRef(areas);
  areasRef.current = areas;

  const loadAvailability = useCallback(async () => {
    const currentAreas = areasRef.current;
    if (currentAreas.length === 0) {
      setAvailability(null);
      setLoadingAreas(false);
      return;
    }

    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoadingAreas(true);
    setAreaError(null);

    try {
      const response = await authenticatedFetch<AvailableLocationsResponse>(
        getAccessToken,
        "/api/locations/available",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id, areas: currentAreas }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted || sequence !== requestSequence.current) return;

      setAvailability(response);
      setManualIds((previous) => {
        const allowed = new Set(
          response.locations.filter((location) => location.hasCapacity).map((location) => location.id),
        );
        const preserved = [...previous].filter((id) => allowed.has(id));
        const preselected = response.locations
          .filter((location) => location.selected && location.hasCapacity)
          .map((location) => location.id);
        return new Set(preserved.length > 0 ? preserved : preselected);
      });
      setLoadingAreas(false);
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setAreaError(caught instanceof ClientApiError ? caught.message : "Could not load approved locations.");
      setLoadingAreas(false);
    } finally {
      if (sequence === requestSequence.current) requestController.current = null;
    }
  }, [campaign.id, getAccessToken]);

  useEffect(() => {
    if (phase !== "area") return;
    // Dragging a radius slider changes areasKey on every step, so settle first.
    const timer = window.setTimeout(() => void loadAvailability(), 250);
    return () => {
      window.clearTimeout(timer);
      cancelRequest();
    };
  }, [phase, areasKey, loadAvailability, cancelRequest]);

  const withCapacity = availability?.locations.filter((location) => location.hasCapacity) ?? [];
  const availableCount = withCapacity.length;
  const requested = campaign.placementCount ?? 0;
  const selectedCount =
    strategy === "AUTO_APPROVED" ? Math.min(requested || availableCount, availableCount) : manualIds.size;

  // The exact set of pins that will actually be used — the same set the map
  // highlights, surfaced as a plain list so the choice can be checked without
  // having to read dots on a map.
  const autoSelected = withCapacity.slice(0, selectedCount);
  const selectedIds =
    strategy === "MANUAL_SELECTION" ? manualIds : new Set(autoSelected.map((location) => location.id));
  const selectedLocations: AvailableLocationDto[] =
    strategy === "MANUAL_SELECTION"
      ? withCapacity.filter((location) => manualIds.has(location.id))
      : autoSelected;

  const fulfilmentMinor = estimateLocalFulfilmentMinor(selectedCount, assetType);
  const deploymentMinutes = estimateDeploymentMinutes(selectedCount);
  const shortfall = requested > 0 && availableCount < requested;
  const canContinue =
    !submitting &&
    !loadingAreas &&
    areas.length > 0 &&
    availableCount > 0 &&
    (strategy === "AUTO_APPROVED" || manualIds.size > 0);

  function updateArea(index: number, patch: Partial<DraftArea>) {
    setAreas((previous) => previous.map((area, position) => (position === index ? { ...area, ...patch } : area)));
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

  async function submitAreas() {
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
        caught instanceof ClientApiError ? caught.message : "Could not save your campaign areas. Please try again.",
      );
    }
  }

  function backToCity() {
    setPhase("city");
  }

  // ---- render -------------------------------------------------------

  if (!isMapConfigured) {
    return (
      <Card className="px-6 py-10 text-center">
        <h2 className="text-[18px] font-bold">Map is not configured</h2>
        <p className="mx-auto mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
          Set <code className="text-badge">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to a public
          Mapbox token, restricted to your domains, then reload this step. Until then you can
          still pick one of the cities below.
        </p>
        <div className="mx-auto mt-6 flex max-w-[520px] flex-wrap justify-center gap-2">
          {cities.map((place) => (
            <button
              key={`${place.city}-${place.countryCode}`}
              type="button"
              onClick={() => choosePlace(place)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                selectedPlace?.city === place.city
                  ? "border-badge text-badge"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {place.city}
            </button>
          ))}
        </div>
        {cityError ? <p className="mt-4 text-[13px] text-fail">{cityError}</p> : null}
        <button
          type="button"
          disabled={!selectedPlace || savingCity}
          onClick={() => void confirmCity()}
          className="mx-auto mt-7 block h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink disabled:cursor-not-allowed disabled:opacity-35"
        >
          {savingCity ? "Saving…" : "Continue"}
        </button>
      </Card>
    );
  }

  const cityPanel = (
    <Card className="flex h-full flex-col p-5">
      <h2 className="text-[17px] font-bold tracking-[-0.02em]">Where should we deploy your campaign?</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Drag the map, or search for a country, city or venue.
      </p>

      <div className="mt-4 rounded-xl border border-line px-1">
        <LocationSearch onSelect={choosePlace} />
      </div>

      {briefHint ? (
        <button
          type="button"
          onClick={() =>
            choosePlace({
              city: briefHint.city,
              countryCode: briefHint.countryCode,
              countryName: briefHint.countryName,
              latitude: briefHint.latitude,
              longitude: briefHint.longitude,
            })
          }
          className="mt-3 self-start rounded-full border border-badge/50 px-3 py-1.5 text-[12px] font-semibold text-badge transition-colors hover:bg-badge/10"
        >
          Use {briefHint.city} from your brief
        </button>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
          Cities with approved surfaces
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cities.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-muted">Loading available cities…</p>
          ) : (
            cities.map((place) => (
              <button
                key={`${place.city}-${place.countryCode}`}
                type="button"
                onClick={() => choosePlace(place)}
                title={`${place.locationCount} approved surfaces`}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  selectedPlace?.city === place.city
                    ? "border-badge text-badge"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {place.city}
                <span className="ml-1.5 text-[11px] text-faint">{place.locationCount}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-line pt-4">
        {selectedPlace ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Selected</p>
            <p className="mt-1 truncate text-[19px] font-bold tracking-[-0.02em]">{selectedPlace.city}</p>
            <p className="truncate text-[12.5px] text-muted">{selectedPlace.countryName}</p>
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Choose a country or city to continue. Approved surfaces are confirmed next.
          </p>
        )}

        {cityError ? <p className="mt-2 text-[12.5px] text-fail">{cityError}</p> : null}

        <button
          type="button"
          disabled={!selectedPlace || savingCity}
          onClick={() => void confirmCity()}
          className="mt-4 h-11 w-full rounded-xl bg-solid text-[14px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {savingCity ? "Saving…" : selectedPlace ? `Continue with ${selectedPlace.city}` : "Continue"}
        </button>
      </div>
    </Card>
  );

  const areaCounts = availability?.areas ?? [];

  const areaPanel = (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">
            Areas in {campaign.city}{" "}
            <button
              type="button"
              onClick={backToCity}
              className="ml-1 text-[12px] font-semibold text-badge hover:underline"
            >
              Change city
            </button>
          </h2>
          <span className="text-[11.5px] text-faint">{areas.length} of {maxAreas}</span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Target several neighbourhoods at once. Each is highlighted on the map.
        </p>

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
                    onChange={(event) => updateArea(index, { label: event.target.value })}
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
                    onChange={(event) => updateArea(index, { radiusMetres: Number(event.target.value) })}
                    aria-label={`${area.label} radius`}
                    className="h-1 flex-1 accent-[color:var(--badge,#6ea8fe)]"
                  />
                  <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                    {formatRadius(area.radiusMetres)}
                  </span>
                </div>

                <p className="mt-1.5 text-[11.5px] text-faint">
                  {loadingAreas ? "Checking…" : count === undefined ? "—" : `${count} approved ${count === 1 ? "surface" : "surfaces"}`}
                </p>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={areas.length >= maxAreas}
          onClick={() => setAddingArea((value) => !value)}
          className={`mt-2.5 h-9 w-full rounded-xl border border-dashed text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            addingArea ? "border-badge text-badge" : "border-line text-muted hover:text-ink"
          }`}
        >
          {areas.length >= maxAreas ? "Area limit reached" : addingArea ? "Click the map to place it" : "+ Add another area"}
        </button>

        <fieldset className="mt-4 border-t border-line pt-3.5">
          <legend className="text-[12px] font-semibold text-muted">Asset type</legend>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {assetTypeOptions.map((option) => (
              <label
                key={option.value}
                title={option.description}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                  assetType === option.value ? "border-badge bg-raised" : "border-line hover:border-muted"
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
                <span className="text-[11px] font-semibold text-faint">{option.priceLabel} price</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4 border-t border-line pt-3.5">
          <legend className="text-[12px] font-semibold text-muted">Choosing surfaces</legend>
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

        {/* The actual pins this campaign will use, named — not just dots on a
            map. In manual mode these are the same toggles as the pins. */}
        <div className="mt-4 border-t border-line pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-[12px] font-semibold text-muted">
              {strategy === "MANUAL_SELECTION" ? "Confirm your surfaces" : "Surfaces StickerBomb picked"}
            </legend>
            <span className="text-[11.5px] font-semibold text-faint">
              {selectedLocations.length} selected
            </span>
          </div>
          {loadingAreas ? (
            <p className="mt-2 text-[12px] text-faint">Checking…</p>
          ) : selectedLocations.length === 0 ? (
            <p className="mt-2 text-[12px] text-faint">
              {strategy === "MANUAL_SELECTION" ? "Tap a pin on the map to add a surface." : "No surfaces in range yet."}
            </p>
          ) : (
            <ul className="mt-2 max-h-[220px] space-y-1 overflow-y-auto">
              <AnimatePresence initial={false}>
              {selectedLocations.map((location) => (
                <motion.li
                  key={location.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <button
                    type="button"
                    disabled={strategy !== "MANUAL_SELECTION"}
                    onClick={() => toggleLocation(location.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[12.5px] ${
                      strategy === "MANUAL_SELECTION" ? "hover:border-fail hover:text-fail" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        aria-hidden
                        style={{ backgroundColor: areaColor(location.areaIndex ?? 0) }}
                        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                      />
                      <span className="truncate font-semibold">{location.venueName}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">
                      {strategy === "MANUAL_SELECTION" ? "Remove" : `${location.distanceMetres} m`}
                    </span>
                  </button>
                </motion.li>
              ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3.5">
          {areaError ? (
            <div>
              <p className="text-[12.5px] text-fail">{areaError}</p>
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
                <dd className="font-semibold">{loadingAreas ? "…" : availableCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Deployment time</dt>
                <dd className="font-semibold">{selectedCount > 0 ? `${deploymentMinutes} min` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Local fulfilment</dt>
                <dd className="font-semibold">
                  {selectedCount > 0 ? formatCampaignBudget(minorToDisplay(fulfilmentMinor), campaign.currency) : "—"}
                </dd>
              </div>
            </dl>
          )}

          {!loadingAreas && !areaError && availableCount === 0 ? (
            <p className="mt-2.5 rounded-xl border border-fail/25 bg-fail/5 px-3 py-2 text-[12px] leading-relaxed text-fail">
              No approved locations in these areas yet. Widen a radius, move an area, or add another.
            </p>
          ) : null}

          {!loadingAreas && !areaError && shortfall && availableCount > 0 ? (
            <p className="mt-2.5 rounded-xl border border-line bg-raised px-3 py-2 text-[12px] leading-relaxed text-muted">
              {availableCount} of {requested} requested placements can be filled. Add an area to reach more.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line p-5">
        {saveError ? <p className="mb-2 text-[12.5px] text-fail">{saveError}</p> : null}
        <p className="mb-2.5 text-[11px] leading-relaxed text-faint">
          The list above is exactly what gets used. A worker sees the exact surface only after accepting the job.
        </p>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => void submitAreas()}
          className="h-11 w-full rounded-xl bg-solid text-[14px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {submitting ? "Saving…" : "Continue to artwork"}
        </button>
      </div>
    </Card>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      {/* The city panel hands over to the area panel in place, on the same map. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase}
          className="h-full min-h-0"
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        >
          {phase === "city" ? cityPanel : areaPanel}
        </motion.div>
      </AnimatePresence>

      <div className="relative h-[440px] overflow-hidden rounded-[20px] border border-line lg:h-[calc(min(100vh,960px)-300px)] lg:min-h-[440px]">
        <MapboxGlobe
          spin={phase === "city" && !selectedPlace}
          flyTo={phase === "city" && selectedPlace ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude } : null}
          cursor={phase === "area" && addingArea ? "crosshair" : undefined}
          onMapClick={phase === "area" && addingArea ? addAreaAt : undefined}
          initialView={
            phase === "area"
              ? {
                  latitude: areas[0]?.latitude ?? campaign.centerLatitude ?? 0,
                  longitude: areas[0]?.longitude ?? campaign.centerLongitude ?? 0,
                  zoom: 12,
                  pitch: 30,
                }
              : undefined
          }
          fitAreas={
            phase === "area" ? areas.map((area) => ({ latitude: area.latitude, longitude: area.longitude, radiusMetres: area.radiusMetres })) : null
          }
        >
          {phase === "area" ? (
            <>
              <CampaignRadius areas={areas} activeIndex={activeIndex} />
              <ApprovedLocationPins
                locations={availability?.locations ?? []}
                selectedIds={selectedIds}
                interactive={strategy === "MANUAL_SELECTION"}
                onToggle={toggleLocation}
              />
            </>
          ) : null}
        </MapboxGlobe>

        {phase === "area" && addingArea ? (
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
