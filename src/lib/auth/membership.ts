import { OrganizationRole, type Prisma } from "@/generated/prisma/client";

export type MembershipDatabase = Pick<
  Prisma.TransactionClient,
  "organizationMember"
>;

export async function findBrandMembership(
  database: MembershipDatabase,
  userId: string,
) {
  return database.organizationMember.findFirst({
    where: {
      userId,
      role: {
        in: [OrganizationRole.BRAND, OrganizationRole.OPERATOR],
      },
    },
    include: { organization: true },
    orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
  });
}

export async function findPrimaryMembership(
  database: MembershipDatabase,
  userId: string,
) {
  const brandMembership = await findBrandMembership(database, userId);
  if (brandMembership) return brandMembership;

  return database.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
    orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
  });
}
