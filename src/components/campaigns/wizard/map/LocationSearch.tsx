"use client";

import { SearchBox } from "@mapbox/search-js-react";
import { useState } from "react";
import type { SelectedPlace } from "@/lib/campaigns/geo";
import { mapboxAccessToken } from "@/lib/campaigns/mapbox";

/**
 * The Search Box result shape, narrowed defensively.
 *
 * The SDK's types are loose about which context entries are present, and a
 * country-level result has no `place`, so every field is treated as optional.
 */
type RetrievedFeature = {
  properties?: {
    name?: string;
    feature_type?: string;
    coordinates?: { latitude?: number; longitude?: number };
    context?: {
      country?: { name?: string; country_code?: string };
      place?: { name?: string };
      region?: { name?: string };
      locality?: { name?: string };
    };
  };
};

function toSelectedPlace(feature: RetrievedFeature): SelectedPlace | null {
  const properties = feature.properties;
  const coordinates = properties?.coordinates;
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  const context = properties?.context;
  const countryName = context?.country?.name?.trim() ?? "";
  const countryCode = context?.country?.country_code?.trim().toUpperCase() ?? "";

  // For a city result the name is the city; for a venue or address the city
  // comes from its place context.
  const city =
    (properties?.feature_type === "place"
      ? properties.name
      : context?.place?.name ??
        context?.locality?.name ??
        properties?.name) ?? "";

  if (!city.trim() || !countryName) return null;

  return {
    city: city.trim(),
    countryCode,
    countryName,
    latitude,
    longitude,
  };
}

export default function LocationSearch({
  onSelect,
}: {
  onSelect: (place: SelectedPlace) => void;
}) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div>
      {/*
        The SDK ships loose prop types that do not line up with React 19's
        JSX definitions, so the component is widened at the boundary only.
      */}
      <SearchBox
        accessToken={mapboxAccessToken}
        value={value}
        onChange={(next: string) => {
          setValue(next);
          setNotice(null);
        }}
        placeholder="Search country, city or venue"
        options={{ types: "country,region,place,locality,poi" }}
        onRetrieve={(response: { features?: RetrievedFeature[] }) => {
          const feature = response.features?.[0];
          const place = feature ? toSelectedPlace(feature) : null;

          if (!place) {
            setNotice(
              "That result did not include a city and country. Try searching for a city.",
            );
            return;
          }

          setNotice(null);
          onSelect(place);
        }}
        // The suggestion list is absolutely positioned, so it needs a solid
        // background of its own or it renders over the panel content below.
        theme={{
          variables: {
            colorBackground: "#141417",
            colorBackgroundHover: "#1e1e23",
            colorBackgroundActive: "#1e1e23",
            colorText: "#f4f4f5",
            colorSecondary: "#9b9ba4",
            colorPrimary: "#6ea8fe",
            border: "1px solid #2a2a31",
            borderRadius: "12px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
            unit: "13px",
          },
        }}
      />

      {notice ? (
        <p className="mt-2 text-[12.5px] text-fail">{notice}</p>
      ) : null}
    </div>
  );
}
