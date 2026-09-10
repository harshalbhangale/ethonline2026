import type {
  JobRoleValue,
  JobStatusValue,
  PlacementStatusValue,
} from "@/lib/placements/types";

/**
 * An open job before acceptance.
 *
 * Only an approximate area is disclosed; the venue, exact point and
 * instructions are revealed after the worker accepts.
 */
export type NearbyJobDto = {
  id: string;
  role: JobRoleValue;
  rewardMinor: string;
  reward: string;
  currency: string;
  campaign: { name: string; deadline: string | null };
  area: {
    city: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  };
  distanceKm: number | null;
  createdAt: string;
};

export type NearbyJobsResponse = {
  jobs: NearbyJobDto[];
};

/** A job the worker holds. Exact placement details appear only here. */
export type WorkerJobDto = {
  id: string;
  role: JobRoleValue;
  status: JobStatusValue;
  rewardMinor: string;
  reward: string;
  currency: string;
  campaign: { id: string; name: string };
  placement: { id: string; status: PlacementStatusValue };
  asset: { shortCode: string };
  location: {
    venueName: string;
    city: string;
    latitude: number;
    longitude: number;
    placementInstructions: string;
    surfacePhotoUrl: string | null;
  };
  acceptedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  paidAt: string | null;
};

export type WorkerJobResponse = {
  job: WorkerJobDto;
};

export type WorkerJobsResponse = {
  jobs: WorkerJobDto[];
};

export type WorkerEarningsResponse = {
  currency: string;
  paidMinor: string;
  paid: string;
  pendingMinor: string;
  pending: string;
  completedJobs: number;
};
