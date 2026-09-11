import { z } from "zod";
import {
  normalizeEventName,
  recordConversion,
} from "@/lib/assets/conversions";
import { readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called from the brand's own site, on their own domain, so this has to be
 * open to any origin. It is safe to be: the only thing it accepts is a token
 * the caller could only have received by actually landing from a scan, and the
 * only thing it can do with that token is append a row.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const bodySchema = z.object({
  click: z.string().min(1).max(60),
  event: z.string().max(60).optional(),
  /** Minor units, so a purchase can carry its worth without float rounding. */
  value: z.number().int().nonnegative().max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
});

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  // Always 204, whatever happened. This runs on a stranger's browser on the
  // brand's page: it must never surface an error to a real visitor, and it must
  // not reveal whether a token was real.
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const name = normalizeEventName(body.event);

    if (name) {
      await recordConversion({
        clickToken: body.click,
        name,
        valueMinor: body.value === undefined ? null : BigInt(body.value),
        currency: body.currency?.toUpperCase() ?? null,
      });
    }
  } catch (error) {
    console.error("Conversion postback failed", error);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
}
