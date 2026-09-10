import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted campaign details.",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  console.error("Unexpected API error", error);

  // Outside production, echo the real fault. A bare "something went wrong"
  // forces guesswork, and this response never reaches real users.
  const debug =
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : undefined,
        };

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        ...(debug ? { debug } : {}),
      },
    },
    { status: 500 },
  );
}
