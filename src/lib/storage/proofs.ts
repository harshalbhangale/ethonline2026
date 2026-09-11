import { createHash } from "node:crypto";
import { ApiError } from "@/lib/http/api-error";
import { getStorageClient, imageExtensions } from "@/lib/storage/client";

/**
 * sha256 of a stored proof, or null if it is not there. Proves the upload
 * finished and gives the confidential check a fingerprint to catch reused
 * photos.
 */
export async function hashProofObject(path: string) {
  const { data, error } = await getClient().storage.from(bucket).download(path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

const bucket = "proofs";
const viewWindowSeconds = 300;

const getClient = getStorageClient;
const extensions = imageExtensions;

export function isAllowedProofType(contentType: string) {
  return contentType in extensions;
}

/**
 * Signed URL the phone uploads straight to, so image bytes never pass through a
 * route handler.
 */
export async function createProofUploadUrl(
  jobId: string,
  workerId: string,
  contentType: string,
) {
  const extension = extensions[contentType];

  if (!extension) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload a JPEG, PNG or WebP photo.",
    );
  }

  // Worker and timestamp in the path so one job's proofs never collide.
  const path = `${jobId}/${workerId}-${Date.now()}.${extension}`;
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new ApiError(
      502,
      "UPLOAD_URL_FAILED",
      "Could not start the photo upload. Please try again.",
    );
  }

  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** Confirms the object exists before a proof row is allowed to reference it. */
export async function proofObjectExists(path: string) {
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return false;

  const { data, error } = await getClient()
    .storage.from(bucket)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });

  return !error && (data?.length ?? 0) > 0;
}

export async function createProofViewUrl(path: string) {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUrl(path, viewWindowSeconds);

  return error || !data ? null : data.signedUrl;
}
