import { verifyPrivyRequest } from "@/lib/auth/privy";
import { getPrismaClient } from "@/lib/database/prisma";

export type AuthenticatedUser = {
  userId: string;
  privyUserId: string;
};

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const claims = await verifyPrivyRequest(request);
  const prisma = getPrismaClient();
  // The user almost always exists already: one read beats an upsert's
  // read-then-write on every authenticated request.
  const user =
    (await prisma.user.findUnique({
      where: { privyUserId: claims.user_id },
      select: { id: true, privyUserId: true },
    })) ??
    (await prisma.user.upsert({
      where: { privyUserId: claims.user_id },
      update: {},
      create: { privyUserId: claims.user_id },
    }));

  return {
    userId: user.id,
    privyUserId: user.privyUserId,
  };
}
