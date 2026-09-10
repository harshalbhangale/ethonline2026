import type { ApiErrorPayload } from "@/lib/campaigns/types";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string[] | undefined>,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

type GetAccessToken = () => Promise<string | null>;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | null | undefined) {
  if (!signal?.aborted) return;

  if (signal.reason !== undefined) throw signal.reason;

  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  throw error;
}

export async function authenticatedFetch<T>(
  getAccessToken: GetAccessToken,
  input: string,
  init: RequestInit = {},
): Promise<T> {
  throwIfAborted(init.signal);
  const token = await getAccessToken();
  throwIfAborted(init.signal);

  if (!token) {
    throw new ClientApiError("Sign in to continue.", 401, "UNAUTHENTICATED");
  }

  let response: Response;

  try {
    response = await fetch(input, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch (caught) {
    if (init.signal?.aborted || isAbortError(caught)) throw caught;

    throw new ClientApiError(
      "Could not reach StickerBomb. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  let payload: T & ApiErrorPayload;

  try {
    payload = (await response.json()) as T & ApiErrorPayload;
  } catch (caught) {
    if (init.signal?.aborted || isAbortError(caught)) throw caught;
    payload = {} as T & ApiErrorPayload;
  }

  throwIfAborted(init.signal);

  if (!response.ok) {
    throw new ClientApiError(
      payload.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      payload.error?.code,
      payload.error?.fields,
      payload.error?.details,
    );
  }

  return payload;
}
