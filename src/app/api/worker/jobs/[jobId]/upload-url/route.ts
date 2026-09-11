import { z } from "zod";
import { requireWorkerContext } from "@/lib/auth/require-worker";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { assertAwaitingProof } from "@/lib/jobs/worker-view";
import { createProofUploadUrl, isAllowedProofType } from "@/lib/storage/proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadSchema = z.object({ contentType: z.string().max(60) });

/**
 * A signed URL the phone uploads its photo straight to, so image bytes never
 * pass through a route handler. Only the worker who owes proof may upload.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    const { contentType } = uploadSchema.parse(await readJsonBody(request));

    if (!isAllowedProofType(contentType)) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload a JPEG, PNG or WebP photo.");
    }

    await assertAwaitingProof(context, jobId);

    return Response.json(await createProofUploadUrl(jobId, context.userId, contentType));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
