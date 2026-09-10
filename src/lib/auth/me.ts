import { findPrimaryMembership } from "@/lib/auth/membership";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import type { MeResponse } from "@/lib/auth/types";
import { getPrismaClient } from "@/lib/database/prisma";

/** The signed-in user's portal access, resolved from server-side records only. */
export async function buildMeResponse(
  user: AuthenticatedUser,
): Promise<MeResponse> {
  const prisma = getPrismaClient();
  const [membership, worker] = await Promise.all([
    findPrimaryMembership(prisma, user.userId),
    prisma.workerProfile.findUnique({
      where: { userId: user.userId },
      select: { displayName: true, selfieCheckStatus: true },
    }),
  ]);

  return {
    user: {
      id: user.userId,
      privyUserId: user.privyUserId,
    },
    organization: membership
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
        }
      : null,
    // An organization role wins; a worker profile alone makes a worker.
    role: membership?.role ?? (worker ? "WORKER" : null),
    worker,
  };
}
