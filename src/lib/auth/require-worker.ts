import { WorkerRiskStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

export type WorkerContext = {
  userId: string;
  privyUserId: string;
  displayName: string;
};

/**
 * Resolves the calling worker from server-side records.
 *
 * Every job action is authorized here; no client-supplied role or user ID is
 * trusted. The World Selfie Check gate is added here in Phase 4.
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

  return {
    userId: user.userId,
    privyUserId: user.privyUserId,
    displayName: profile.displayName ?? "Worker",
  };
}
