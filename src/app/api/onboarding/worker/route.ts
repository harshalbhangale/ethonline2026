import { OrganizationRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_ORG_SLUG = "stickerbomb-workers";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const prisma = getPrismaClient();

    const profile = await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.upsert({
        where: { slug: WORKER_ORG_SLUG },
        update: {},
        create: {
          name: "StickerBomb workers",
          slug: WORKER_ORG_SLUG,
          createdById: user.userId,
        },
      });

      await transaction.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.userId,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          userId: user.userId,
          role: OrganizationRole.WORKER,
        },
      });

      return transaction.workerProfile.upsert({
        where: { userId: user.userId },
        update: {},
        create: { userId: user.userId },
      });
    });

    return Response.json({
      worker: {
        id: profile.id,
        createdAt: profile.createdAt.toISOString(),
      },
      role: OrganizationRole.WORKER,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
