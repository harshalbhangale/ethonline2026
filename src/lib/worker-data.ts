import type { PlacementJobStatusValue, WorkerJobDto } from "@/lib/jobs/types";

export type Job = WorkerJobDto;

export const statusLabel: Record<PlacementJobStatusValue, string> = {
  OPEN: "Open",
  ACCEPTED: "In progress",
  AWAITING_CHECK: "Waiting to be checked",
  CHECK_ACCEPTED: "Check in progress",
  VERIFIED: "Verified and paid",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

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
