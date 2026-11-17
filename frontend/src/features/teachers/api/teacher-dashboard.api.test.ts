import { afterEach, describe, expect, it, vi } from "vitest";

import { getTeacherDashboardSummary } from "./teacher-dashboard.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = {
  statusCounts: {
    total: 4,
    draft: 1,
    pendingReview: 1,
    published: 1,
    rejected: 1,
  },
  recentDraftCourses: [
    {
      id: "550e8400-e29b-41d4-a716-446655440020",
      title: "Algebra",
      status: "draft",
      updatedAt: "2026-11-16T10:00:00.000Z",
    },
  ],
};

function stubJsonResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getTeacherDashboardSummary", () => {
  it("fetches the summary with same-origin credentials and preserves draft order", async () => {
    const fetchMock = stubJsonResponse(summary);

    await expect(getTeacherDashboardSummary()).resolves.toEqual(summary);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/dashboard/summary",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("converts an invalid successful payload to a safe ApiError", async () => {
    stubJsonResponse({ statusCounts: {}, recentDraftCourses: [] });

    await expect(getTeacherDashboardSummary()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });

  it("preserves authentication and server errors from the API client", async () => {
    for (const status of [401, 403, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              title: "Request failed",
              status,
              detail: "The request could not be completed.",
            }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(getTeacherDashboardSummary()).rejects.toMatchObject({
        name: "ApiError",
        status,
      });
    }
  });
});
