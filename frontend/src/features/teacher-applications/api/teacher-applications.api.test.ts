import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  getMyTeacherApplication,
  submitTeacherApplication,
} from "./teacher-applications.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
};

const pendingApplication = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  status: "pending" as const,
  motivation: request.motivation,
  qualifications: request.qualifications,
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

describe("submitTeacherApplication", () => {
  it("posts the shared request and returns the safe application response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(pendingApplication), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitTeacherApplication({
        motivation: `  ${request.motivation}  `,
        qualifications: `  ${request.qualifications}  `,
      }),
    ).resolves.toEqual(pendingApplication);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher-applications",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(request),
      }),
    );
  });

  it("rejects invalid request data before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitTeacherApplication({
        motivation: "   ",
        qualifications: request.qualifications,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Invalid request", "The request body is invalid."],
    [401, "Authentication required", "A valid session is required."],
    [
      403,
      "Application unavailable",
      "This account is not eligible to submit a teacher application.",
    ],
    [
      409,
      "Application already pending",
      "A pending teacher application already exists.",
    ],
  ])(
    "preserves API Problem Details for HTTP %i",
    async (status, title, detail) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ title, status, detail }), {
            status,
            headers: { "Content-Type": "application/problem+json" },
          }),
        ),
      );

      await expect(submitTeacherApplication(request)).rejects.toMatchObject({
        name: "ApiError",
        status,
        title,
        detail,
      });
    },
  );

  it("rejects a successful response that fails the shared response contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "invalid" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(submitTeacherApplication(request)).rejects.toMatchObject({
      name: "ApiError",
      status: 201,
      detail: "The server returned an unexpected application response.",
    });
  });
});

describe("getMyTeacherApplication", () => {
  it("gets the authenticated user's application using same-origin credentials", async () => {
    const responseBody = { application: pendingApplication };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMyTeacherApplication()).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher-applications/me",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("returns a null application when the user has not applied", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ application: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getMyTeacherApplication()).resolves.toEqual({
      application: null,
    });
  });

  it("preserves authentication failures for callers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Authentication required",
            status: 401,
            detail: "A valid session is required.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    await expect(getMyTeacherApplication()).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("rejects a malformed successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ application: { id: "invalid" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getMyTeacherApplication()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      detail: "The server returned an unexpected application response.",
    });
  });
});
