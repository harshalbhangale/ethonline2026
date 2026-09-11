import { z } from "zod";
import { resolveAppUrl } from "@/lib/assets/app-url";
import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import {
  acceptCheck,
  acceptPlacement,
  confirmPlacement,
  rejectPlacement,
  submitInstallProof,
} from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Confirming a check records both payout wallets onchain.
export const maxDuration = 300;

const photoProof = {
  photoPath: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().nonnegative().max(100_000).optional(),
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept-placement") }),
  z.object({ action: z.literal("submit-proof"), ...photoProof }),
  z.object({ action: z.literal("accept-check") }),
  z.object({ action: z.literal("confirm"), ...photoProof }),
  z.object({ action: z.literal("reject"), reason: z.string().max(200).optional() }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    const body = actionSchema.parse(await readJsonBody(request));

    switch (body.action) {
      case "accept-placement":
        return Response.json({ job: await acceptPlacement(context, jobId) });
      case "submit-proof":
        return Response.json({ job: await submitInstallProof(context, jobId, body) });
      case "accept-check":
        return Response.json({ job: await acceptCheck(context, jobId) });
      case "confirm":
        return Response.json({
          job: await confirmPlacement(context, jobId, body, resolveAppUrl(request)),
        });
      case "reject":
        return Response.json({ job: await rejectPlacement(context, jobId, body.reason) });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
