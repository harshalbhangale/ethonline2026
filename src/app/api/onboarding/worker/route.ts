import { z } from "zod";
import { buildMeResponse } from "@/lib/auth/me";
import { requireUser } from "@/lib/auth/require-user";
import { getPrismaClient } from "@/lib/database/prisma";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workerOnboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
});

/** Creates or renames the caller's worker profile. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = workerOnboardingSchema.parse(await readJsonBody(request));

    await getPrismaClient().workerProfile.upsert({
      where: { userId: user.userId },
      update: { displayName: input.displayName },
      create: { userId: user.userId, displayName: input.displayName },
    });

    return Response.json(await buildMeResponse(user));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
