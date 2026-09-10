import { OrganizationRole } from "@/generated/prisma/client";
import { findBrandMembership } from "@/lib/auth/membership";
import { requireUser } from "@/lib/auth/require-user";
import type { MeResponse } from "@/lib/auth/types";
import { getPrismaClient } from "@/lib/database/prisma";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const prisma = getPrismaClient();
    const membership = await prisma.$transaction(async (transaction) => {
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

    const response: MeResponse = {
      user: {
        id: user.userId,
        privyUserId: user.privyUserId,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
      },
      role: membership.role,
    };

    return Response.json(response);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
