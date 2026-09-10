import { OrganizationRole } from "@/generated/prisma/client";
import { findBrandMembership } from "@/lib/auth/membership";
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

export async function requireBrandContext(
  request: Request,
): Promise<BrandContext> {
  const user = await requireUser(request);
  const prisma = getPrismaClient();
  const membership = await findBrandMembership(prisma, user.userId);

  if (!membership) {
    throw new ApiError(
      403,
      "BRAND_ACCESS_REQUIRED",
      "This account does not have access to the brand portal.",
    );
  }

  return {
    userId: user.userId,
    privyUserId: user.privyUserId,
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}
