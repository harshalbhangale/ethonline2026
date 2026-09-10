"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import Map, { type MapRef } from "react-map-gl/mapbox";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  cityView,
  globeView,
  mapboxAccessToken,
  mapStyle,
  maxSpinZoom,
  secondsPerRevolution,
} from "@/lib/campaigns/mapbox";

export type MapPoint = { latitude: number; longitude: number };

export type RadiusBounds = MapPoint & { radiusMetres: number };

/** Combined bounds of every area, so none is cropped out of view. */
function areaBounds(areas: RadiusBounds[]) {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const area of areas) {
    const deltaLat = (area.radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);
    const deltaLng =
      deltaLat / Math.max(Math.cos((area.latitude * Math.PI) / 180), 1e-6);

    minLat = Math.min(minLat, area.latitude - deltaLat);
    maxLat = Math.max(maxLat, area.latitude + deltaLat);
    minLng = Math.min(minLng, area.longitude - deltaLng);
    maxLng = Math.max(maxLng, area.longitude + deltaLng);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

const EARTH_RADIUS_METRES = 6_371_000;

/**
 * One Mapbox instance, reused across the location and placement steps.
 *
 * It begins as a slowly rotating globe and becomes the detailed city map as it
 * flies in. Two separate maps are deliberately avoided: it would break the
 * transition and double the metered map loads.
 */
export default function MapboxGlobe({
  flyTo = null,
  fitAreas = null,
  initialView,
  spin = true,
  cursor,
  onMapClick,
  children,
  onReady,
}: {
  flyTo?: MapPoint | null;
  fitAreas?: RadiusBounds[] | null;
  initialView?: Partial<typeof globeView>;
  spin?: boolean;
  cursor?: string;
  onMapClick?: (point: MapPoint) => void;
  children?: ReactNode;
  onReady?: () => void;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const interactingRef = useRef(false);
  const spinEnabledRef = useRef(spin);
  const lastFlyRef = useRef<string | null>(null);
  const lastFitRef = useRef<string | null>(null);

  // A brand that has already chosen a place should never see the globe idle.
  if (!spin || flyTo) spinEnabledRef.current = false;

  const spinGlobe = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!spinEnabledRef.current || interactingRef.current) return;
    if (map.getZoom() >= maxSpinZoom) return;

    const degreesPerSecond = 360 / secondsPerRevolution;
    const center = map.getCenter();
    center.lng -= degreesPerSecond;

    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) spinEnabledRef.current = false;

    map.on("moveend", spinGlobe);
    onReady?.();
    spinGlobe();
  }, [onReady, spinGlobe]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !flyTo) return;

    const key = `${flyTo.latitude},${flyTo.longitude}`;
    if (lastFlyRef.current === key) return;
    lastFlyRef.current = key;

    spinEnabledRef.current = false;

    map.flyTo({
      center: [flyTo.longitude, flyTo.latitude],
      zoom: cityView.zoom,
      pitch: cityView.pitch,
      duration: cityView.flyDurationMs,
      essential: true,
    });
  }, [flyTo]);

  // Keep every coverage circle in view as areas and radii change.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !fitAreas || fitAreas.length === 0) return;

    const key = fitAreas
      .map((a) => `${a.latitude},${a.longitude},${a.radiusMetres}`)
      .join("|");
    if (lastFitRef.current === key) return;
    lastFitRef.current = key;

    map.fitBounds(areaBounds(fitAreas), {
      padding: 80,
      maxZoom: 15,
      duration: 900,
      essential: true,
    });
  }, [fitAreas]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    return () => {
      map?.off("moveend", spinGlobe);
    };
  }, [spinGlobe]);

  function stopSpinning() {
    interactingRef.current = true;
    spinEnabledRef.current = false;
  }

  function releaseInteraction() {
    interactingRef.current = false;
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={mapboxAccessToken}
      mapStyle={mapStyle}
      initialViewState={{ ...globeView, ...initialView }}
      projection={{ name: "globe" }}
      reuseMaps
      attributionControl={false}
      cursor={cursor}
      onClick={(event) =>
        onMapClick?.({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        })
      }
      onLoad={handleLoad}
      onMouseDown={stopSpinning}
      onTouchStart={stopSpinning}
      onWheel={stopSpinning}
      onDragStart={stopSpinning}
      onMouseUp={releaseInteraction}
      onTouchEnd={releaseInteraction}
      onDragEnd={releaseInteraction}
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </Map>
  );
}
