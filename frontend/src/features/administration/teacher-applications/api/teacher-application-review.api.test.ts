import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  approveAdminTeacherApplication,
  getAdminTeacherApplication,
  listAdminTeacherApplications,
  rejectAdminTeacherApplication,
} from "./teacher-application-review.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const applicationId = "550e8400-e29b-41d4-a716-446655440002";

const applicant = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  displayName: "Synthetic Applicant",
  email: "applicant@example.test",
};

const reviewer = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  displayName: "Synthetic Administrator",
  email: "administrator@example.test",
};

const pendingApplication = {
  id: applicationId,
  applicant,
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  status: "pending" as const,
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

const listResponse = {
  items: [pendingApplication],
  pagination: {
    page: 2,
    pageSize: 25,
    totalItems: 26,
    totalPages: 2,
  },
};

const decisionResponse = {
  applicationId,
  status: "approved" as const,
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer,
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

describe("listAdminTeacherApplications", () => {
  it("validates filters and builds a safely encoded paginated URL", async () => {
    const fetchMock = stubJsonResponse(listResponse);

    await expect(
      listAdminTeacherApplications({
        status: "pending",
        page: 2,
        pageSize: 25,
      }),
    ).resolves.toEqual(listResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications?page=2&pageSize=25&status=pending",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("applies the shared pagination defaults", async () => {
    const fetchMock = stubJsonResponse({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });

    await listAdminTeacherApplications();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications?page=1&pageSize=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects invalid filters before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listAdminTeacherApplications({ page: 0 }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getAdminTeacherApplication", () => {
  it("validates the ID and returns the administrator response contract", async () => {
    const fetchMock = stubJsonResponse(pendingApplication);

    await expect(getAdminTeacherApplication(applicationId)).resolves.toEqual(
      pendingApplication,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/teacher-applications/${applicationId}`,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("rejects an invalid ID before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAdminTeacherApplication("not-a-uuid"),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("administrator decisions", () => {
  it("posts validated approval notes and parses the safe decision response", async () => {
    const fetchMock = stubJsonResponse(decisionResponse);

    await expect(
      approveAdminTeacherApplication(applicationId, {
        reviewNotes: "  Approved after review.  ",
      }),
    ).resolves.toEqual(decisionResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ reviewNotes: "Approved after review." }),
      }),
    );
  });

  it("posts a validated rejection reason", async () => {
    const response = {
      ...decisionResponse,
      status: "rejected" as const,
    };
    const fetchMock = stubJsonResponse(response);

    await expect(
      rejectAdminTeacherApplication(applicationId, {
        rejectionReason: "  Please provide more relevant experience.  ",
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/teacher-applications/${applicationId}/reject`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          rejectionReason: "Please provide more relevant experience.",
        }),
      }),
    );
  });

  it("rejects invalid decision input before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      rejectAdminTeacherApplication(applicationId, {
        rejectionReason: "   ",
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 409, 500])(
    "preserves the shared API error for HTTP %i",
    async (status) => {
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

      await expect(
        approveAdminTeacherApplication(applicationId, {}),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Request failed",
        detail: "The request could not be completed.",
      });
    },
  );

  it("rejects successful responses that do not match the shared contract", async () => {
    stubJsonResponse({ applicationId: "invalid" });

    await expect(
      approveAdminTeacherApplication(applicationId, {}),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      detail: "The server returned an unexpected administrator response.",
    });
  });
});
