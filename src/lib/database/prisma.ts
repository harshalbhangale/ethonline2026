import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let prismaClient: PrismaClient | undefined;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new ApiError(
      500,
      "DATABASE_NOT_CONFIGURED",
      "Database access is not configured.",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({ adapter });
}

/**
 * A cached development client is only safe to reuse if it was built by the
 * PrismaClient currently in scope.
 *
 * Regenerating the client after a schema change produces a new class, and the
 * old instance has no delegate for newly added models. Reusing it fails with an
 * opaque "cannot read properties of undefined" instead of a real error.
 */
function isReusable(candidate: PrismaClient | undefined) {
  return candidate instanceof PrismaClient;
}

export function getPrismaClient() {
  if (!isReusable(prismaClient)) {
    prismaClient = isReusable(globalForPrisma.prisma)
      ? globalForPrisma.prisma
      : createPrismaClient();
  }

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient as PrismaClient;
}
