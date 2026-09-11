"use client";

import { usePrivy } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import type { SelectedPlace } from "@/lib/campaigns/geo";
import { isMapConfigured } from "@/lib/campaigns/mapbox";
import { knownPlaces } from "@/lib/campaigns/places";
import type { CampaignDto } from "@/lib/campaigns/types";
import type { ServiceableCity } from "@/lib/locations/service";

// Mapbox GL touches window at import time and ships a large bundle, so it is
// loaded only in the browser and only when this step is reached.
const MapboxGlobe = dynamic(
  () => import("@/components/campaigns/wizard/map/MapboxGlobe"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-raised">
        <span className="text-[13px] font-semibold text-muted">
          Loading the globe…
        </span>
      </div>
    ),
  },
);

// Mapbox Search JS reaches for `document` when it is imported, so it must never
// be evaluated during server rendering.
const LocationSearch = dynamic(
  () => import("@/components/campaigns/wizard/map/LocationSearch"),
  {
    ssr: false,
    loading: () => (
      <div className="px-3 py-2.5 text-[13px] text-faint">Loading search…</div>
    ),
  },
);

export default function LocationStep({
  campaign,
  submitting,
  onContinue,
}: {
  campaign: CampaignDto;
  submitting: boolean;
  onContinue: (place: SelectedPlace) => Promise<void>;
}) {
  const initial = useMemo<SelectedPlace | null>(() => {
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

  const [selected, setSelected] = useState<SelectedPlace | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [cities, setCities] = useState<ServiceableCity[]>([]);

  // Only cities with approved surfaces are offered. Suggesting a city we cannot
  // service sends the brand to a placement step with nothing in it.
  const { getAccessToken } = usePrivy();
  useEffect(() => {
    let cancelled = false;

    void authenticatedFetch<{ cities: ServiceableCity[] }>(
      getAccessToken,
      "/api/locations/cities",
    )
      .then((response) => {
        if (!cancelled) setCities(response.cities);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  // The brief may have named a city before any coordinates existed.
  const briefHint =
    !selected && campaign.city
      ? knownPlaces.find(
          (place) => place.city.toLowerCase() === campaign.city?.toLowerCase(),
        ) ?? null
      : null;

  async function submit() {
    if (!selected) return;
    setError(null);

    try {
      await onContinue(selected);
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not save this location. Please try again.",
      );
    }
  }

  if (!isMapConfigured) {
    return (
      <Card className="px-6 py-10">
        <h2 className="text-[18px] font-bold">Map is not configured</h2>
        <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
          Set <code className="text-badge">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to a
          public Mapbox token, restricted to your domains, then reload this step.
          Until then you can still pick one of the cities below.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {cities.map((place) => (
            <button
              key={`${place.city}-${place.countryCode}`}
              type="button"
              onClick={() => setSelected(place)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                selected?.city === place.city
                  ? "border-badge text-badge"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {place.city}
            </button>
          ))}
        </div>

        {error ? <p className="mt-4 text-[13px] text-fail">{error}</p> : null}

        <button
          type="button"
          disabled={!selected || submitting}
          onClick={() => void submit()}
          className="mt-7 h-11 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink disabled:cursor-not-allowed disabled:opacity-35"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </Card>
    );
  }

  // Typed as SelectedPlace so a serviceable city's suggested radius survives
  // into state rather than being narrowed away.
  function choose(place: SelectedPlace) {
    setSelected(place);
    setError(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="flex flex-col p-5">
        <h2 className="text-[17px] font-bold tracking-[-0.02em]">
          Where should we deploy your campaign?
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Drag the globe, or search for a country, city or venue.
        </p>

        <div className="mt-4 rounded-xl border border-line px-1">
          <LocationSearch onSelect={choose} />
        </div>

        {briefHint ? (
          <button
            type="button"
            onClick={() =>
              choose({
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
              <p className="text-[12.5px] leading-relaxed text-muted">
                Loading available cities…
              </p>
            ) : (
              cities.map((place) => (
                <button
                  key={`${place.city}-${place.countryCode}`}
                  type="button"
                  onClick={() => choose(place)}
                  title={`${place.locationCount} approved surfaces`}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    selected?.city === place.city
                      ? "border-badge text-badge"
                      : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {place.city}
                  <span className="ml-1.5 text-[11px] text-faint">
                    {place.locationCount}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-auto border-t border-line pt-4">
          {selected ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
                Selected
              </p>
              <p className="mt-1 truncate text-[19px] font-bold tracking-[-0.02em]">
                {selected.city}
              </p>
              <p className="truncate text-[12.5px] text-muted">
                {selected.countryName}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-muted">
              Choose a country or city to continue. Approved surfaces are
              confirmed on the next step.
            </p>
          )}

          {error ? (
            <p className="mt-2 text-[12.5px] text-fail">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => void submit()}
            className="mt-4 h-11 w-full rounded-xl bg-solid text-[14px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting
              ? "Saving…"
              : selected
                ? `Continue with ${selected.city}`
                : "Continue"}
          </button>
        </div>
      </Card>

      <div className="h-[420px] overflow-hidden rounded-[20px] border border-line lg:h-[calc(min(100vh,960px)-300px)] lg:min-h-[440px]">
        <MapboxGlobe
          flyTo={
            selected
              ? { latitude: selected.latitude, longitude: selected.longitude }
              : null
          }
        />
      </div>
    </div>
  );
}
