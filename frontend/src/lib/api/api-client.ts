import { ApiError } from "./api-error.js";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiPath = `/api/v1${string}`;

export interface ApiRequestOptions {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

const API_PREFIX = "/api/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function isJsonContentType(contentType: string | null): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType?.startsWith("application/") === true &&
      mediaType.endsWith("+json"))
  );
}

function getValidationErrors(
  problem: Record<string, unknown>,
  legacyError: Record<string, unknown> | undefined,
): unknown {
  if ("errors" in problem) {
    return problem.errors;
  }

  if ("validationErrors" in problem) {
    return problem.validationErrors;
  }

  if (legacyError && "errors" in legacyError) {
    return legacyError.errors;
  }

  if (legacyError && "validationErrors" in legacyError) {
    return legacyError.validationErrors;
  }

  return undefined;
}

function createHttpError(response: Response, responseBody: string): ApiError {
  const fallback = new ApiError({
    status: response.status,
    title: "Request failed",
    detail: "The server returned an unsuccessful response.",
  });

  if (!isJsonContentType(response.headers.get("content-type"))) {
    return fallback;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(responseBody) as unknown;
  } catch {
    return fallback;
  }

  if (!isRecord(payload)) {
    return fallback;
  }

  const legacyError = isRecord(payload.error) ? payload.error : undefined;
  const title =
    readString(payload.title) ??
    readString(legacyError?.title) ??
    fallback.title;
  const detail =
    readString(payload.detail) ??
    readString(legacyError?.message) ??
    readString(payload.message);

  return new ApiError({
    status: response.status,
    title,
    detail,
    validationErrors: getValidationErrors(payload, legacyError),
  });
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export async function apiRequest<TResponse>(
  path: ApiPath,
  options: ApiRequestOptions = {},
): Promise<TResponse | undefined> {
  if (
    path !== API_PREFIX &&
    !path.startsWith(`${API_PREFIX}/`) &&
    !path.startsWith(`${API_PREFIX}?`)
  ) {
    throw new Error(`API paths must be under ${API_PREFIX}.`);
  }

  const { method = "GET", body, headers: requestHeaders, signal } = options;
  const headers = new Headers(requestHeaders);

  headers.set("Accept", "application/json");

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw error;
    }

    throw new ApiError({
      status: null,
      title: "Network error",
      detail:
        "Unable to connect to the server. Check your connection and try again.",
    });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw createHttpError(response, responseBody);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const responseBody = await response.text();

  if (responseBody.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(responseBody) as TResponse;
  } catch {
    throw new ApiError({
      status: response.status,
      title: "Invalid response",
      detail: "The server returned an unreadable response.",
    });
  }
}
