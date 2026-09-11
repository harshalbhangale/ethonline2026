"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
} from "react-map-gl/mapbox";
import { Card } from "@/components/ui";
import { authenticatedFetch } from "@/lib/api/authenticated-fetch";
import { circlePolygon } from "@/lib/campaigns/circle";
import { isMapConfigured, mapboxAccessToken, mapStyle } from "@/lib/campaigns/mapbox";
import { placementStatusLabels } from "@/lib/placements/format";
import type {
  LiveCampaignResponse,
  LivePlacementDto,
  PlacementStats,
} from "@/lib/placements/live";

/** Fast while someone is out working, slow when the map is only a plan. */
const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;

const EARTH_RADIUS_METRES = 6_371_000;

/** Only used before the first response arrives; the server sends the real one. */
const DEFAULT_RADIUS_METRES = 75;

type LoadState = {
  scope: string | null;
  data: LiveCampaignResponse | null;
  loading: boolean;
  error: string | null;
};

function venueBounds(placements: LivePlacementDto[], radiusMetres: number) {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  const points = placements.flatMap((placement) => [
    placement.venue,
    ...(placement.worker ? [placement.worker] : []),
  ]);
  if (points.length === 0) return null;

  // Pad by the fence so a circle is never clipped at the edge of the frame.
  const deltaLat = (radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);

  for (const point of points) {
    const deltaLng =
      deltaLat / Math.max(Math.cos((point.latitude * Math.PI) / 180), 1e-6);

    minLat = Math.min(minLat, point.latitude - deltaLat);
    maxLat = Math.max(maxLat, point.latitude + deltaLat);
    minLng = Math.min(minLng, point.longitude - deltaLng);
    maxLng = Math.max(maxLng, point.longitude + deltaLng);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/**
 * Scans, arrivals and conversions for one poster.
 *
 * Shown as a row of counts rather than a chart: with one or two placements a
 * chart would imply more precision than a handful of scans deserves.
 */
function Funnel({ stats }: { stats: PlacementStats }) {
  if (stats.scans === 0) {
    return (
      <p className="mt-2 text-[12px] text-faint">
        No scans yet. Counts appear here once the poster is up and people scan
        it.
      </p>
    );
  }

  const steps: [string, number, string][] = [
    ["Scans", stats.scans, "text-ink"],
    ["People", stats.uniqueScanners, "text-ink"],
    ["Landed", stats.landings, "text-scan"],
    ["Converted", stats.conversions, "text-paid"],
  ];

  return (
    <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
      {steps.map(([label, value, tone]) => (
        <div key={label}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">
            {label}
          </p>
          <p className={`text-[17px] font-extrabold tracking-[-0.02em] ${tone}`}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Delivery-style tracking for one funded campaign.
 *
 * Only rendered for funded campaigns: it is loaded lazily so an unfunded draft
 * never pays for mapbox-gl.
 */
export default function LivePlacementMap({
  campaignId,
}: {
  campaignId: string;
}) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const requestScope = userId ? `${userId}:${campaignId}` : null;
  const mapRef = useRef<MapRef | null>(null);
  const requestSequence = useRef(0);
  const lastFitRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    scope: null,
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback(
    async (silent = false) => {
      if (!requestScope) return;

      const scope = requestScope;
      const sequence = ++requestSequence.current;

      if (!silent) {
        setLoadState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: true,
          error: null,
        }));
      }

      try {
        const data = await authenticatedFetch<LiveCampaignResponse>(
          getAccessToken,
          `/api/campaigns/${campaignId}/live`,
        );
        if (sequence !== requestSequence.current) return;
        setLoadState({ scope, data, loading: false, error: null });
      } catch (caught) {
        if (sequence !== requestSequence.current) return;
        setLoadState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: false,
          error:
            caught instanceof Error
              ? caught.message
              : "Could not load live tracking.",
        }));
      }
    },
    [campaignId, getAccessToken, requestScope],
  );

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !requestScope) {
      setLoadState({ scope: null, data: null, loading: false, error: null });
      return;
    }

    void load();
  }, [ready, authenticated, requestScope, load]);

  const current =
    requestScope && loadState.scope === requestScope
      ? loadState
      : { data: null, loading: !ready || Boolean(requestScope), error: null };
  const { data, loading, error } = current;
  const anyActive = Boolean(data?.anyActive);

  // Follow workers closely while any job is underway.
  useEffect(() => {
    if (!requestScope) return;

    const timer = setInterval(
      () => void load(true),
      anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [anyActive, requestScope, load]);

  // Memoised so the geometry below is not rebuilt on every render.
  const placements = useMemo(() => data?.placements ?? [], [data]);
  const radiusMeters = data?.radiusMeters ?? DEFAULT_RADIUS_METRES;

  const fences = useMemo(
    () =>
      ({
        type: "FeatureCollection" as const,
        features: placements.map((placement) => ({
          type: "Feature" as const,
          properties: { active: placement.worker !== null },
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              circlePolygon(
                placement.venue.latitude,
                placement.venue.longitude,
                radiusMeters,
              ),
            ],
          },
        })),
      }) satisfies GeoJSON.FeatureCollection,
    [placements, radiusMeters],
  );

  // A leader line from each worker to the venue they are heading for.
  const approaches = useMemo(
    () =>
      ({
        type: "FeatureCollection" as const,
        features: placements
          .filter((placement) => placement.worker !== null)
          .map((placement) => ({
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: [
                [placement.worker!.longitude, placement.worker!.latitude],
                [placement.venue.longitude, placement.venue.latitude],
              ],
            },
          })),
      }) satisfies GeoJSON.FeatureCollection,
    [placements],
  );

  // Keep every venue and worker in frame as positions move.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || placements.length === 0) return;

    const bounds = venueBounds(placements, radiusMeters);
    if (!bounds) return;

    const key = JSON.stringify(bounds);
    if (lastFitRef.current === key) return;
    lastFitRef.current = key;

    map.fitBounds(bounds, {
      padding: 64,
      maxZoom: 16,
      duration: 800,
      essential: true,
    });
  }, [placements, radiusMeters]);

  if (!ready || (loading && !data)) {
    return <div className="h-80 animate-pulse rounded-[20px] bg-raised" />;
  }
  if (!requestScope) return null;

  if (error && !data) {
    return (
      <Card className="px-6 py-8 text-center">
        <h2 className="text-[17px] font-bold">Live tracking unavailable</h2>
        <p className="mt-2 text-[13.5px] text-muted">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (!data || placements.length === 0) return null;

  const active = placements.filter((placement) => placement.worker !== null);
  const totals = placements.reduce(
    (running, placement) => ({
      scans: running.scans + placement.stats.scans,
      conversions: running.conversions + placement.stats.conversions,
    }),
    { scans: 0, conversions: 0 },
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-[16px] font-bold">Live placement map</h2>
        <p className="text-[12.5px] text-muted">
          Where each poster goes, and who is on the way right now. Approximate
          positions only, never worker identities.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-[12px] text-muted">
          <span className="font-bold text-ink">{totals.scans}</span> scans ·{" "}
          <span className="font-bold text-paid">{totals.conversions}</span>{" "}
          converted
        </span>
        <span
          className={`inline-flex items-center gap-2 text-[12px] font-semibold ${
            anyActive ? "text-scan" : "text-faint"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              anyActive ? "animate-pulse bg-scan" : "bg-line"
            }`}
          />
          {anyActive
            ? `${active.length} on the move`
            : "Nobody on site right now"}
        </span>
      </div>
    </div>
  );

  const roster = (
    <ul className="divide-y divide-line">
      {placements.map((placement) => (
        <li key={placement.id} className="px-5 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">
                {placement.venueName}
              </p>
              <p className="text-[12px] text-muted">
                {placementStatusLabels[placement.status]} ·{" "}
                <span className="font-mono">{placement.shortCode}</span>
              </p>
            </div>
            {placement.worker ? (
              <p className="shrink-0 text-[12px] font-semibold text-scan">
                {placement.worker.role === "VERIFIER" ? "Checker" : "Installer"}{" "}
                {formatDistance(placement.worker.distanceMetres)} away ·{" "}
                {relativeTime(placement.worker.updatedAt)}
              </p>
            ) : null}
          </div>

          <Funnel stats={placement.stats} />
        </li>
      ))}
    </ul>
  );

  if (!isMapConfigured) {
    return (
      <Card className="overflow-hidden">
        {header}
        <p className="border-b border-line px-5 py-3 text-[12px] text-faint sm:px-6">
          Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to see this as a map.
        </p>
        {roster}
      </Card>
    );
  }

  const first = placements[0];

  return (
    <Card className="overflow-hidden">
      {header}

      <div className="h-[380px] w-full">
        <Map
          ref={mapRef}
          mapboxAccessToken={mapboxAccessToken}
          mapStyle={mapStyle}
          initialViewState={{
            latitude: first.venue.latitude,
            longitude: first.venue.longitude,
            zoom: 12,
          }}
          reuseMaps
          attributionControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <Source id="live-fences" type="geojson" data={fences}>
            <Layer
              id="live-fences-fill"
              type="fill"
              paint={{
                "fill-color": ["case", ["get", "active"], "#5fd0d8", "#6ea8fe"],
                "fill-opacity": ["case", ["get", "active"], 0.18, 0.08],
              }}
            />
            <Layer
              id="live-fences-line"
              type="line"
              paint={{
                "line-color": ["case", ["get", "active"], "#5fd0d8", "#6ea8fe"],
                "line-width": ["case", ["get", "active"], 2, 1],
                "line-opacity": ["case", ["get", "active"], 1, 0.45],
              }}
            />
          </Source>

          <Source id="live-approaches" type="geojson" data={approaches}>
            <Layer
              id="live-approaches-line"
              type="line"
              paint={{
                "line-color": "#5fd0d8",
                "line-width": 1.5,
                "line-opacity": 0.7,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>

          {placements.map((placement) => (
            <Marker
              key={`venue-${placement.id}`}
              latitude={placement.venue.latitude}
              longitude={placement.venue.longitude}
              anchor="bottom"
            >
              <span
                title={`${placement.venueName} — ${placementStatusLabels[placement.status]}`}
                className="block max-w-[168px] truncate rounded-full border border-line bg-bg/90 px-2.5 py-1 text-[11.5px] font-semibold shadow-lg backdrop-blur-sm"
              >
                {placement.venueName}
              </span>
            </Marker>
          ))}

          {active.map((placement) => (
            <Marker
              key={`worker-${placement.id}`}
              latitude={placement.worker!.latitude}
              longitude={placement.worker!.longitude}
              anchor="center"
            >
              <span
                title={`${placement.worker!.role === "VERIFIER" ? "Checker" : "Installer"} — ${formatDistance(placement.worker!.distanceMetres)} away, ${relativeTime(placement.worker!.updatedAt)}`}
                className="relative block h-3.5 w-3.5"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-scan/60" />
                <span className="absolute inset-0 rounded-full border-2 border-bg bg-scan" />
              </span>
            </Marker>
          ))}
        </Map>
      </div>

      {roster}
    </Card>
  );
}
