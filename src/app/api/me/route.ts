import { buildMeResponse } from "@/lib/auth/me";
import { requireUser } from "@/lib/auth/require-user";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    return Response.json(await buildMeResponse(user));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
