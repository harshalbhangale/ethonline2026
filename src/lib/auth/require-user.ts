import { verifyPrivyRequest } from "@/lib/auth/privy";
import { getPrismaClient } from "@/lib/database/prisma";

export type AuthenticatedUser = {
  userId: string;
  privyUserId: string;
};

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const claims = await verifyPrivyRequest(request);
  const prisma = getPrismaClient();
  const user = await prisma.user.upsert({
    where: { privyUserId: claims.user_id },
    update: {},
    create: { privyUserId: claims.user_id },
  });

  return {
    userId: user.id,
    privyUserId: user.privyUserId,
  };
}
