import { createHash } from "node:crypto";

/**
 * Privacy-safe scan attribution.
 *
 * We never store a visitor's identity, IP address or raw user agent. Only
 * salted one-way hashes are kept, which is enough to estimate unique scans
 * without being able to re-identify anyone.
 */
const salt = process.env.PRIVY_APP_SECRET ?? "stickerbomb-scan-salt";

function hash(value: string) {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 64);
}

const botPattern =
  /\b(bot|crawler|spider|crawl|slurp|curl|wget|python-requests|headless|phantomjs|puppeteer|playwright|monitoring|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|twitterbot|linkedinbot|bingpreview)\b/i;

export type ScanSignals = {
  referrer: string | null;
  userAgentHash: string | null;
  sessionHash: string | null;
  coarseRegion: string | null;
  isSuspectedBot: boolean;
};

export function deriveScanSignals(request: Request): ScanSignals {
  const headers = request.headers;
  const userAgent = headers.get("user-agent") ?? "";
  const referrer = headers.get("referer");

  // Coarse region only: a country or region code from the edge, never a city,
  // coordinates or IP address.
  const coarseRegion =
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    headers.get("x-country-code") ??
    null;

  // The session hash exists to separate repeat scans from distinct visitors.
  // It is derived from coarse, non-identifying signals plus the day, so it
  // cannot be used to track someone across days.
  const forwardedFor = headers.get("x-forwarded-for") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const sessionSeed = `${forwardedFor}|${userAgent}|${day}`;

  return {
    referrer: referrer ? referrer.slice(0, 512) : null,
    userAgentHash: userAgent ? hash(userAgent) : null,
    sessionHash: forwardedFor || userAgent ? hash(sessionSeed) : null,
    coarseRegion: coarseRegion ? coarseRegion.slice(0, 120) : null,
    isSuspectedBot: botPattern.test(userAgent) || userAgent.trim().length === 0,
  };
}
