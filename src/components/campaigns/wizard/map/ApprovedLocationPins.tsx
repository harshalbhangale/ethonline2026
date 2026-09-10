"use client";

import { Marker } from "react-map-gl/mapbox";
import { areaColor } from "@/components/campaigns/wizard/map/CampaignRadius";
import type { AvailableLocationDto } from "@/lib/locations/types";

export default function ApprovedLocationPins({
  locations,
  selectedIds,
  interactive,
  onToggle,
}: {
  locations: AvailableLocationDto[];
  selectedIds: Set<string>;
  interactive: boolean;
  onToggle?: (locationId: string) => void;
}) {
  return (
    <>
      {locations.map((location) => {
        const selected = selectedIds.has(location.id);
        const full = !location.hasCapacity;

        const tone = full
          ? "border-line bg-bg/85 text-faint"
          : selected
            ? "text-solid-ink"
            : "border-line bg-bg/90 text-ink";

        // Selected pins take their area's colour so the map reads as grouped.
        const selectedStyle =
          selected && !full
            ? {
                backgroundColor: areaColor(location.areaIndex ?? 0),
                borderColor: areaColor(location.areaIndex ?? 0),
              }
            : undefined;

        const label = full
          ? `${location.venueName} — at capacity`
          : `${location.venueName} — ${location.distanceMetres} m away`;

        return (
          <Marker
            key={location.id}
            latitude={location.latitude}
            longitude={location.longitude}
            anchor="bottom"
          >
            <button
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={interactive ? selected : undefined}
              disabled={!interactive || full}
              onClick={() => onToggle?.(location.id)}
              style={selectedStyle}
              className={`max-w-[168px] truncate rounded-full border px-2.5 py-1 text-[11.5px] font-semibold shadow-lg backdrop-blur-sm transition-colors ${tone} ${
                interactive && !full ? "cursor-pointer" : "cursor-default"
              }`}
            >
              {location.venueName}
            </button>
          </Marker>
        );
      })}
    </>
  );
}
