export type SelectedPlace = {
  city: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in metres.
 *
 * Used to decide which approved locations fall inside a campaign radius. The
 * same expression exists in SQL for server-side inventory queries, so keep the
 * two in step if either changes.
 */
export function distanceInMetres(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLng / 2) ** 2;

  return EARTH_RADIUS_METRES * 2 * Math.asin(Math.sqrt(a));
}

export function formatRadius(radiusMetres: number) {
  if (radiusMetres < 1000) return `${radiusMetres} m`;
  const kilometres = radiusMetres / 1000;
  return `${Number.isInteger(kilometres) ? kilometres : kilometres.toFixed(1)} km`;
}
