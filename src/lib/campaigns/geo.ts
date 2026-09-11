export type SelectedPlace = {
  city: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  /**
   * A radius known to reach this city's approved surfaces. Only present for
   * cities we service; a freehand search from the map has no inventory to
   * measure against.
   */
  suggestedRadiusMetres?: number;
};

/**
 * Radii a campaign area can be set to.
 *
 * Shared so a server-side suggestion can only ever snap to a value the
 * placement step actually offers. The large end exists because a city's
 * approved surfaces can be spread right across a metro.
 */
export const radiusChoices = [
  500, 1_000, 1_500, 3_000, 5_000, 10_000, 25_000,
] as const;

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
