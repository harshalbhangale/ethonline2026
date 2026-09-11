import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/http/api-error";

/**
 * The service-role storage client.
 *
 * Buckets stay private: browsers only ever touch short-lived signed URLs, and
 * anything the server needs to read it downloads itself.
 */
export function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new ApiError(
      500,
      "STORAGE_NOT_CONFIGURED",
      "Object storage is not configured.",
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
