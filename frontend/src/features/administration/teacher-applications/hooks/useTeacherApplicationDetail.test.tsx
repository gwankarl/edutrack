import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../../auth/hooks/auth-query-keys.js";
import { useTeacherApplicationDetail } from "./useTeacherApplicationDetail.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const applicationId = "550e8400-e29b-41d4-a716-446655440002";
const administrator = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  displayName: "Synthetic Administrator",
  email: "administrator@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "administrator"],
};
const application = {
  id: applicationId,
  applicant: {
    id: "550e8400-e29b-41d4-a716-446655440003",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  motivation: "Synthetic motivation.",
  qualifications: "Synthetic qualifications.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

function createWrapper(currentUser: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  queryClient.setQueryData(currentUserQueryKey, currentUser);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { Wrapper };
}

describe("useTeacherApplicationDetail", () => {
  it("loads a valid application ID for an Administrator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(application), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(administrator);
    const { result } = renderHook(
      () => useTeacherApplicationDetail(applicationId),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(application);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications/" + applicationId,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it.each([null, "invalid-id"])(
    "does not fetch for an invalid application ID: %s",
    (invalidId) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { Wrapper } = createWrapper(administrator);
      const { result } = renderHook(
        () => useTeacherApplicationDetail(invalidId),
        { wrapper: Wrapper },
      );

      expect(result.current.validationError).not.toBeNull();
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not fetch for a user without the Administrator role", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper({
      ...administrator,
      roles: ["student", "teacher"],
    });
    const { result } = renderHook(
      () => useTeacherApplicationDetail(applicationId),
      { wrapper: Wrapper },
    );

    expect(result.current.authorizationStatus).toBe("forbidden");
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes not-found API errors without retrying client errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Teacher application not found",
            status: 404,
            detail: "The requested teacher application was not found.",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    const { Wrapper } = createWrapper(administrator);
    const { result } = renderHook(
      () => useTeacherApplicationDetail(applicationId),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toMatchObject({
      name: "ApiError",
      status: 404,
    });
  });
});
