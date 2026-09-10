import { findPrimaryMembership } from "@/lib/auth/membership";
import { requireUser } from "@/lib/auth/require-user";
import type { MeResponse } from "@/lib/auth/types";
import { getPrismaClient } from "@/lib/database/prisma";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const prisma = getPrismaClient();
    const [membership, workerProfile] = await Promise.all([
      findPrimaryMembership(prisma, user.userId),
      prisma.workerProfile.findUnique({ where: { userId: user.userId } }),
    ]);

    const response: MeResponse = {
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
      role: membership?.role ?? null,
      worker: workerProfile ? { id: workerProfile.id } : null,
    };

    return Response.json(response);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
