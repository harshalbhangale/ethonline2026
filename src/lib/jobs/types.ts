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

/** A job's status as the Worker PWA shows it to one worker. */
export type WorkerTaskStatusValue =
  | "OPEN"
  | "ACCEPTED"
  | "AWAITING_CHECK"
  | "CHECK_ACCEPTED"
  | "IN_REVIEW"
  | "NEEDS_RECAPTURE"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

/**
 * One poster as the Worker PWA sees it: the placement, from the viewing
 * worker's point of view as installer or checker.
 */
export type WorkerTaskDto = {
  id: string;
  status: WorkerTaskStatusValue;
  campaignName: string;
  /** Generic ("Approved surface in …") until the worker has accepted. */
  venueName: string;
  city: string;
  /** Rounded to about 1 km until the worker has accepted. */
  latitude: number;
  longitude: number;
  placementInstructions: string | null;
  shortCode: string;
  installerFeeMinor: string;
  verifierFeeMinor: string;
  currency: string;
  deadline: string | null;
  proofAt: string | null;
  checkedAt: string | null;
  isInstaller: boolean;
  isVerifier: boolean;
  /** Why this worker's last photo was rejected, when a recapture is needed. */
  rejectionReason: string | null;
  /** SELF: the installer verifies; INDEPENDENT: a random spot check. */
  verificationMode: "SELF" | "INDEPENDENT";
  /** "Stick & verify" unlocks inside this radius... */
  geofenceRadiusMeters: number;
  /** ...after this long on site. */
  minDwellSeconds: number;
  /** Signed, short-lived. Only set on the single-job endpoint. */
  proofPhotoUrl?: string | null;
};

/**
 * The answer to one live location ping while a worker holds a job: how far
 * off they are, how long they have been on site, and whether that is enough
 * to unlock proof submission.
 */
export type WorkerPingDto = {
  distanceMetres: number;
  insideFence: boolean;
  secondsOnSite: number;
  readyToVerify: boolean;
  minDwellSeconds: number;
  radiusMeters: number;
};

export type WorkerWalletDto = {
  earnedMinor: string;
  pendingMinor: string;
  currency: string;
  /** The Privy wallet escrow payouts are sent to. */
  payoutAddress: string | null;
  history: {
    id: string;
    kind: string;
    amountMinor: string;
    venueName: string | null;
    createdAt: string;
    explorerUrl: string | null;
  }[];
};
