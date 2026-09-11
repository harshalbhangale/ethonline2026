"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Marker, Source, Layer } from "react-map-gl/mapbox";
import { circlePolygon } from "@/lib/campaigns/circle";
import { isMapConfigured } from "@/lib/campaigns/mapbox";
import type { Fix } from "@/components/worker/LivePresence";

const MapboxGlobe = dynamic(
  () => import("@/components/campaigns/wizard/map/MapboxGlobe"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[168px] w-full items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--raised)]">
        <span className="text-[13px] text-[var(--faint)]">Loading the map…</span>
      </div>
    ),
  },
);

/**
 * The real map: the venue, the fence proof unlocks inside, and the worker's
 * own live position moving on it. Replaces a static decorative SVG that drew
 * the same fixed dot regardless of where anyone actually was.
 */
export default function VenueMap({
  lat,
  lng,
  label,
  radiusMeters,
  fix,
}: {
  lat: number;
  lng: number;
  label: string;
  /** The geofence proof unlocks inside, when known. */
  radiusMeters?: number;
  /** The worker's own live position, if it has been acquired. */
  fix?: Fix | null;
}) {
  const fence = useMemo(
    () =>
      radiusMeters
        ? ({
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Polygon" as const,
              coordinates: [circlePolygon(lat, lng, radiusMeters)],
            },
          } satisfies GeoJSON.Feature)
        : null,
    [lat, lng, radiusMeters],
  );

  if (!isMapConfigured) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--raised)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{label}</p>
            <p className="mt-0.5 text-[12px] text-[var(--faint)]">
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </p>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] font-medium"
          >
            Directions
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--raised)]">
      <div className="h-[168px] w-full">
        <MapboxGlobe spin={false} initialView={{ latitude: lat, longitude: lng, zoom: 15.5, pitch: 0 }}>
          {fence ? (
            <Source id="worker-fence" type="geojson" data={fence}>
              <Layer
                id="worker-fence-fill"
                type="fill"
                paint={{ "fill-color": "#f0a35e", "fill-opacity": 0.14 }}
              />
              <Layer
                id="worker-fence-line"
                type="line"
                paint={{ "line-color": "#f0a35e", "line-width": 2 }}
              />
            </Source>
          ) : null}

          <Marker latitude={lat} longitude={lng} anchor="bottom">
            <div className="h-4 w-4 rounded-full border-2 border-[var(--bg)] bg-[var(--amber)] shadow-lg" />
          </Marker>

          {fix ? (
            <Marker latitude={fix.latitude} longitude={fix.longitude} anchor="center">
              <div className="h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-[var(--good)] shadow-lg" />
            </Marker>
          ) : null}
        </MapboxGlobe>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{label}</p>
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </p>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] font-medium"
        >
          Directions
        </a>
      </div>
    </div>
  );
}
