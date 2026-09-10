/**
 * The Mapbox access token is public by design: Mapbox GL JS runs in the browser.
 *
 * Restrict it to your deployed domains and local development in the Mapbox
 * dashboard. Never put a secret `sk.` token here.
 */
export const mapboxAccessToken =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";

export const isMapConfigured = mapboxAccessToken.length > 0;

/** A dark style that suits the existing surface palette. */
export const mapStyle = "mapbox://styles/mapbox/dark-v11";

export const globeView = {
  longitude: 10,
  latitude: 12,
  /** Tuned so the globe fills a side-by-side panel rather than a full viewport. */
  zoom: 1.45,
  pitch: 0,
  bearing: 0,
};

export const cityView = {
  zoom: 11,
  pitch: 35,
  /** Matches the brief's cinematic transition without being sluggish. */
  flyDurationMs: 2_500,
};

/** Above this zoom the globe stops idling so it never fights the user. */
export const maxSpinZoom = 4;
export const secondsPerRevolution = 140;
