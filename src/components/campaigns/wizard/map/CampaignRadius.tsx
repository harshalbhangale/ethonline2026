"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import { circlePolygon } from "@/lib/campaigns/circle";

/** Distinct hues so overlapping areas stay readable. */
export const areaColors = [
  "#6ea8fe",
  "#7bdcb5",
  "#f0a35e",
  "#c792ea",
  "#f2789f",
  "#5fd0d8",
];

export function areaColor(index: number) {
  return areaColors[index % areaColors.length];
}

export type MapArea = {
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
};

export default function CampaignRadius({
  areas,
  activeIndex,
}: {
  areas: MapArea[];
  activeIndex: number | null;
}) {
  const data = useMemo(
    () =>
      ({
        type: "FeatureCollection" as const,
        features: areas.map((area, index) => ({
          type: "Feature" as const,
          properties: {
            color: areaColor(index),
            active: activeIndex === null || activeIndex === index,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              circlePolygon(area.latitude, area.longitude, area.radiusMetres),
            ],
          },
        })),
      }) satisfies GeoJSON.FeatureCollection,
    [areas, activeIndex],
  );

  return (
    <Source id="campaign-areas" type="geojson" data={data}>
      <Layer
        id="campaign-areas-fill"
        type="fill"
        paint={{
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["get", "active"], 0.16, 0.05],
        }}
      />
      <Layer
        id="campaign-areas-line"
        type="line"
        paint={{
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "active"], 2, 1],
          "line-opacity": ["case", ["get", "active"], 1, 0.4],
          "line-dasharray": [2, 2],
        }}
      />
    </Source>
  );
}
