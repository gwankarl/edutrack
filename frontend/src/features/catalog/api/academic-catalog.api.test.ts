import { afterEach, describe, expect, it, vi } from "vitest";

import { getAcademicLevels, getSubjects } from "./academic-catalog.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJsonResponse(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("getAcademicLevels", () => {
  it("returns the shared response in its deterministic order", async () => {
    const response = {
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          code: "form-4",
          name: "Form 4",
          educationStage: "lower_secondary",
          sortOrder: 4,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          code: "lower-sixth",
          name: "Lower Sixth",
          educationStage: "upper_secondary",
          sortOrder: 6,
        },
      ],
    };
    const fetchMock = stubJsonResponse(response);

    await expect(getAcademicLevels()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/academic-levels",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("rejects malformed catalog responses", async () => {
    stubJsonResponse({
      items: [
        {
          id: "bad-id",
          code: "form-4",
          name: "Form 4",
          educationStage: "lower_secondary",
          sortOrder: 4,
        },
      ],
    });

    await expect(getAcademicLevels()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});

describe("getSubjects", () => {
  it("returns the shared subject list response", async () => {
    const response = {
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          code: "mathematics",
          name: "Mathematics",
          sortOrder: 1,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440011",
          code: "physics",
          name: "Physics",
          sortOrder: 2,
        },
      ],
    };
    const fetchMock = stubJsonResponse(response);

    await expect(getSubjects()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/subjects",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("rejects malformed catalog responses", async () => {
    stubJsonResponse({ items: [{ id: "bad-id" }] });

    await expect(getSubjects()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});
