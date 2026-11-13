import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("preserves RFC 9457 details and validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "https://example.test/validation-error",
            title: "Validation failed",
            status: 422,
            detail: "Correct the highlighted fields.",
            errors: {
              email: ["Enter a valid email address."],
            },
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    await expect(apiRequest("/api/v1/example")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      title: "Validation failed",
      detail: "Correct the highlighted fields.",
      validationErrors: {
        email: ["Enter a valid email address."],
      },
    });
  });

  it("uses a safe fallback for malformed and non-JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    const request = apiRequest("/api/v1/example");

    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      title: "Request failed",
    });

    await expect(request).rejects.not.toThrow("private server diagnostic");
  });

  it("wraps network failures without exposing their original message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError("connection failed password=private-value"),
        ),
    );

    await expect(apiRequest("/api/v1/example")).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      title: "Network error",
      message:
        "Unable to connect to the server. Check your connection and try again.",
    });
  });

  it("preserves AbortSignal cancellation", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const controller = new AbortController();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      apiRequest("/api/v1/example", { signal: controller.signal }),
    ).rejects.toBe(abortError);
  });

  it("returns undefined for an HTTP 204 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiRequest("/api/v1/example")).resolves.toBeUndefined();
  });

  it("sends JSON with same-origin credentials and the requested method", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "example-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<{ id: string }>("/api/v1/example", {
        method: "POST",
        body: { name: "Example" },
      }),
    ).resolves.toEqual({ id: "example-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/example",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ name: "Example" }),
      }),
    );
  });
});
