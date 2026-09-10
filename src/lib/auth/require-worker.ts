import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

export type WorkerContext = {
  userId: string;
  privyUserId: string;
  workerId: string;
};

export async function requireWorkerContext(
  request: Request,
): Promise<WorkerContext> {
  const user = await requireUser(request);
  const prisma = getPrismaClient();
  const profile = await prisma.workerProfile.findUnique({
    where: { userId: user.userId },
  });

  if (!profile) {
    throw new ApiError(
      403,
      "WORKER_PROFILE_REQUIRED",
      "Join as a worker to use the worker portal.",
    );
  }

  return {
    userId: user.userId,
    privyUserId: user.privyUserId,
    workerId: profile.id,
  };
}
