const EARTH_RADIUS_METRES = 6_371_000;

/**
 * Builds a polygon approximating a circle on the globe.
 *
 * Mapbox has no native geodesic circle, and a fixed-pixel circle would misstate
 * the real coverage as the map zooms, so the ring is computed in degrees.
 */
export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusMetres: number,
  steps = 96,
) {
  const coordinates: [number, number][] = [];
  const latitudeRadians = (latitude * Math.PI) / 180;
  const deltaLat = (radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);
  const deltaLng = deltaLat / Math.max(Math.cos(latitudeRadians), 1e-6);

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    coordinates.push([
      longitude + deltaLng * Math.cos(angle),
      latitude + deltaLat * Math.sin(angle),
    ]);
  }

  return coordinates;
}
