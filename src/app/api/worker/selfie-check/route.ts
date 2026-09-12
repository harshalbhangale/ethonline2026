import { z } from "zod";
import { requireUnverifiedWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { getSelfieCheckState, recordSelfieCheck } from "@/lib/world/selfie-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseItemSchema = z.object({
  identifier: z.string().min(1),
  signal_hash: z.string().optional(),
  proof: z.string().min(1),
  merkle_root: z.string().min(1),
  nullifier: z.string().min(1),
});

// Forwarded to World as-is; remapping any field would invalidate the proof.
const proofSchema = z.object({
  protocol_version: z.literal("3.0"),
  nonce: z.string().min(1),
  action: z.string().optional(),
  action_description: z.string().optional(),
  responses: z.array(responseItemSchema).min(1),
  user_presence_completed: z.boolean().optional(),
  environment: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const context = await requireUnverifiedWorkerContext(request);
    return Response.json(await getSelfieCheckState(context.userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Submits an IDKit proof; a verified check unlocks job actions. */
export async function POST(request: Request) {
  try {
    const context = await requireUnverifiedWorkerContext(request);
    const payload = proofSchema.parse(await readJsonBody(request));
    return Response.json(await recordSelfieCheck(context, payload));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
