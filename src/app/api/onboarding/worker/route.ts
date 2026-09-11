import { z } from "zod";
import { buildMeResponse } from "@/lib/auth/me";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError, apiErrorResponse } from "@/lib/http/api-error";
import { ensurePayoutWallet } from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workerOnboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
});

async function readOptionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

/**
 * Creates (or renames) the caller's worker profile and their Privy payout
 * wallet. The Worker PWA calls it with no body on first sign-in.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = workerOnboardingSchema.parse(await readOptionalJson(request));

    await getPrismaClient().workerProfile.upsert({
      where: { userId: user.userId },
      update: input.displayName ? { displayName: input.displayName } : {},
      create: { userId: user.userId, displayName: input.displayName ?? null },
    });

    // Best effort: settlement creates the wallet later if Privy is slow now.
    await ensurePayoutWallet(user.userId).catch((error) => {
      console.warn("Could not create the worker payout wallet yet", error);
    });

    return Response.json(await buildMeResponse(user));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
