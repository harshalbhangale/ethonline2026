import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { updateApprovalThreshold } from "@/lib/treasury/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  /** Dollars, e.g. "100" or "250.50"; null turns second approval off. */
  approvalThreshold: z
    .string()
    .trim()
    .regex(/^\d{1,7}(?:\.\d{1,2})?$/, "Enter an amount such as 100 or 250.50.")
    .nullable(),
});

function toMinor(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export async function PATCH(request: Request) {
  try {
    const context = await requireBrandContext(request);
    const { approvalThreshold } = settingsSchema.parse(await readJsonBody(request));

    return Response.json({
      treasury: await updateApprovalThreshold(
        context,
        approvalThreshold === null ? null : toMinor(approvalThreshold),
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
