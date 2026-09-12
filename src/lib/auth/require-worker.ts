import { WorkerRiskStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { isSelfieCheckEnabled } from "@/lib/world/config";
import { isSelfieCheckCurrent } from "@/lib/world/selfie-check";

export type WorkerContext = {
  userId: string;
  privyUserId: string;
  displayName: string;
};

/**
 * Resolves the calling worker from server-side records.
 *
 * Every job action is authorized here; no client-supplied role or user ID is
 * trusted. While WORLD_SELFIE_CHECK_ENABLED is true, a current World Selfie
 * Check is also required, so paid work needs a live human behind the account.
 */
export async function requireWorkerContext(
  request: Request,
): Promise<WorkerContext> {
  const user = await requireUser(request);
  const profile = await getPrismaClient().workerProfile.findUnique({
    where: { userId: user.userId },
  });

  if (!profile) {
    throw new ApiError(
      403,
      "WORKER_PROFILE_REQUIRED",
      "Complete worker onboarding to see jobs.",
    );
  }

  if (profile.riskStatus === WorkerRiskStatus.BLOCKED) {
    throw new ApiError(
      403,
      "WORKER_BLOCKED",
      "This worker account cannot take jobs.",
    );
  }

  if (isSelfieCheckEnabled() && !isSelfieCheckCurrent(profile)) {
    throw new ApiError(
      403,
      "SELFIE_CHECK_REQUIRED",
      "Verify you're a real person to take jobs.",
    );
  }

  return {
    userId: user.userId,
    privyUserId: user.privyUserId,
    displayName: profile.displayName ?? "Worker",
  };
}

/**
 * The worker behind the request, without the Selfie Check gate.
 *
 * Only for the Selfie Check routes themselves: a worker who has not verified
 * yet still has to be able to start and finish verifying.
 */
export async function requireUnverifiedWorkerContext(
  request: Request,
): Promise<WorkerContext> {
  const user = await requireUser(request);
  const profile = await getPrismaClient().workerProfile.findUnique({
    where: { userId: user.userId },
  });

  if (!profile) {
    throw new ApiError(
      403,
      "WORKER_PROFILE_REQUIRED",
      "Complete worker onboarding to see jobs.",
    );
  }

  if (profile.riskStatus === WorkerRiskStatus.BLOCKED) {
    throw new ApiError(
      403,
      "WORKER_BLOCKED",
      "This worker account cannot take jobs.",
    );
  }

  return {
    userId: user.userId,
    privyUserId: user.privyUserId,
    displayName: profile.displayName ?? "Worker",
  };
}
