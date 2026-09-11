import type { WorkerTaskDto, WorkerTaskStatusValue } from "@/lib/jobs/types";

export type Job = WorkerTaskDto;

export const statusLabel: Record<WorkerTaskStatusValue, string> = {
  OPEN: "Open",
  ACCEPTED: "In progress",
  AWAITING_CHECK: "Waiting to be checked",
  CHECK_ACCEPTED: "Check in progress",
  IN_REVIEW: "Confidential check running",
  NEEDS_RECAPTURE: "Needs a new photo",
  VERIFIED: "Verified and paid",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const rejectionText: Record<string, string> = {
  OUTSIDE_GEOFENCE: "the photo was taken too far from the approved surface",
  WRONG_QR: "the wrong poster was photographed",
  CHALLENGE_EXPIRED: "the photo was taken outside the allowed time",
  CHALLENGE_MISMATCH: "the photo did not match the challenge",
  DUPLICATE_MEDIA: "the same photo was used before",
  SELF_VERIFICATION: "the installer and checker were the same person",
  POSTER_NOT_FOUND: "the checker could not find the poster",
};

/** Turns a rejection code such as "INSTALLER:OUTSIDE_GEOFENCE" into words. */
export function describeRejection(reason: string) {
  const code = reason.split(":").find((part) => part in rejectionText);
  return code ? `Rejected: ${rejectionText[code]}.` : "Your last photo was rejected.";
}

export function formatMoney(minor: string, currency: string) {
  const amount = Number(minor) / 100;

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string | null) {
  if (!value) return "No deadline";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function mapsUrl(job: Job) {
  return `https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`;
}
