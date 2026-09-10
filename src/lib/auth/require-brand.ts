import { OrganizationRole } from "@/generated/prisma/client";
import { verifyPrivyRequest } from "@/lib/auth/privy";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

export type BrandContext = {
  userId: string;
  privyUserId: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
};

function brandAccessRequired() {
  return new ApiError(
    403,
    "BRAND_ACCESS_REQUIRED",
    "This account does not have access to the brand portal.",
  );
}

/**
 * Resolves the caller's brand organization from server-side records.
 *
 * The user and their brand membership load in one query, since this runs on
 * every Brand Portal request.
 */
export async function requireBrandContext(
  request: Request,
): Promise<BrandContext> {
  const claims = await verifyPrivyRequest(request);
  const user = await getPrismaClient().user.findUnique({
    where: { privyUserId: claims.user_id },
    select: {
      id: true,
      privyUserId: true,
      memberships: {
        where: {
          role: { in: [OrganizationRole.BRAND, OrganizationRole.OPERATOR] },
        },
        select: {
          role: true,
          organization: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
        take: 1,
      },
    },
  });

  if (!user) {
    // First request from this identity: record it, but it has no brand yet.
    await requireUser(request);
    throw brandAccessRequired();
  }

  const membership = user.memberships[0];
  if (!membership) throw brandAccessRequired();

  return {
    userId: user.id,
    privyUserId: user.privyUserId,
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}
