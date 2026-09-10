import { PlacementJobStatus } from "@/generated/prisma/client";
import { requireWorkerContext } from "@/lib/auth/require-worker";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { createProofUploadUrl, isAllowedProofType } from "@/lib/storage/proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const contentType =
      typeof body.contentType === "string" ? body.contentType : "";

    if (!isAllowedProofType(contentType)) {
      throw new ApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Upload a JPEG, PNG or WebP photo.",
      );
    }

    // Only the worker on the hook for this job may upload against it.
    const job = await getPrismaClient().placementJob.findUnique({
      where: { id: jobId },
      select: { status: true, installerId: true, verifierId: true },
    });

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "That job no longer exists.");
    }

    const isInstaller =
      job.installerId === context.workerId &&
      job.status === PlacementJobStatus.ACCEPTED;
    const isVerifier =
      job.verifierId === context.workerId &&
      job.status === PlacementJobStatus.CHECK_ACCEPTED;

    if (!isInstaller && !isVerifier) {
      throw new ApiError(
        403,
        "NOT_YOUR_JOB",
        "This job is not waiting for your photo.",
      );
    }

    return Response.json(
      await createProofUploadUrl(jobId, context.workerId, contentType),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
