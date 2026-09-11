import { OrganizationRole } from "@/generated/prisma/client";
import { buildMeResponse } from "@/lib/auth/me";
import { findBrandMembership } from "@/lib/auth/membership";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const prisma = getPrismaClient();
    await prisma.$transaction(async (transaction) => {
      const existing = await findBrandMembership(transaction, user.userId);
      if (existing) return existing;

      const organization = await transaction.organization.upsert({
        where: { slug: `brand-${user.userId}` },
        update: {},
        create: {
          name: "My brand",
          slug: `brand-${user.userId}`,
          createdById: user.userId,
        },
      });

      return transaction.organizationMember.upsert({
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
          role: OrganizationRole.BRAND,
        },
        include: { organization: true },
      });
    });

    return Response.json(await buildMeResponse(user));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
