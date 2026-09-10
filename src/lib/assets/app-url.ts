import { ApiError } from "@/lib/http/api-error";

/**
 * Resolves the absolute base URL that goes inside a printed QR code.
 *
 * This value is permanent once a poster is printed, so it must not drift.
 * NEXT_PUBLIC_APP_URL is preferred; the request origin is only a development
 * convenience.
 */
export function resolveAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new ApiError(
        500,
        "APP_URL_INVALID",
        "NEXT_PUBLIC_APP_URL is not a valid absolute URL.",
      );
    }
  }

  try {
    return new URL(request.url).origin;
  } catch {
    throw new ApiError(
      500,
      "APP_URL_NOT_CONFIGURED",
      "Set NEXT_PUBLIC_APP_URL so printed QR codes point at a stable address.",
    );
  }
}

export function buildScanUrl(appUrl: string, shortCode: string) {
  return `${appUrl}/s/${shortCode}`;
}
