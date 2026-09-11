import { createHash } from "node:crypto";
import { ApiError } from "@/lib/http/api-error";
import { getStorageClient, imageExtensions } from "@/lib/storage/client";

const bucket = "artwork";
const viewWindowSeconds = 600;

export function isAllowedArtworkType(contentType: string) {
  return contentType in imageExtensions;
}

/**
 * Signed URL the browser uploads campaign artwork straight to, so image bytes
 * never pass through a route handler.
 */
export async function createArtworkUploadUrl(
  campaignId: string,
  contentType: string,
) {
  const extension = imageExtensions[contentType];

  if (!extension) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload a JPEG, PNG or WebP image.",
    );
  }

  // Timestamped so re-uploading artwork never collides with the previous file.
  const path = `${campaignId}/${Date.now()}.${extension}`;
  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new ApiError(
      502,
      "UPLOAD_URL_FAILED",
      "Could not start the artwork upload. Please try again.",
    );
  }

  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** The artwork bytes, for the poster renderer. Null when it is not there. */
export async function downloadArtwork(path: string) {
  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .download(path);

  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** sha256 of the stored artwork, so a poster records which image it used. */
export async function hashArtwork(path: string) {
  const bytes = await downloadArtwork(path);
  if (!bytes) return null;
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Confirms the upload finished before the campaign is allowed to point at it. */
export async function artworkObjectExists(path: string) {
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return false;

  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });

  return !error && (data?.length ?? 0) > 0;
}

/** Short-lived URL so the wizard can preview what the brand uploaded. */
export async function createArtworkViewUrl(path: string) {
  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .createSignedUrl(path, viewWindowSeconds);

  return error || !data ? null : data.signedUrl;
}
