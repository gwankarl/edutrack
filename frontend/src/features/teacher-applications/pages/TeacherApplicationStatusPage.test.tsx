import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUserState } from "../../auth/hooks/useCurrentUser.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useMyTeacherApplication } from "../hooks/useMyTeacherApplication.js";
import TeacherApplicationStatusPage from "./TeacherApplicationStatusPage.js";

vi.mock("../../auth/hooks/useCurrentUser.js", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useMyTeacherApplication.js", () => ({
  useMyTeacherApplication: vi.fn(),
}));

const authenticatedUser: CurrentUserState = {
  status: "authenticated",
  user: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles: ["student"],
  },
  error: null,
};

const pendingApplication = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  status: "pending",
  motivation: "Synthetic motivation.",
  qualifications: "Synthetic qualifications.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

function renderStatus(applicationState: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(useCurrentUser).mockReturnValue(authenticatedUser);
  vi.mocked(useMyTeacherApplication).mockReturnValue(
    applicationState as unknown as ReturnType<typeof useMyTeacherApplication>,
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeacherApplicationStatusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherApplicationStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows pending status and the submission date", () => {
    renderStatus({
      authStatus: "authenticated",
      data: { application: pendingApplication },
      isError: false,
      isPending: false,
      isSuccess: true,
    });

    expect(
      screen.getByRole("heading", {
        name: "Your application is pending review",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Submitted 2026-11-14/)).toBeTruthy();
  });

  it("lets a rejected applicant return to the application form", () => {
    renderStatus({
      authStatus: "authenticated",
      data: {
        application: {
          ...pendingApplication,
          status: "rejected",
          reviewedAt: "2026-11-15T12:00:00.000Z",
          rejectionReason: "Please provide more relevant experience.",
        },
      },
      isError: false,
      isPending: false,
      isSuccess: true,
    });

    expect(screen.getByRole("link", { name: /apply again/i })).toHaveAttribute(
      "href",
      "/teacher/apply",
    );
    expect(
      screen.getByText(/please provide more relevant experience/i),
    ).toBeTruthy();
  });

  it("refreshes current-user roles once when an application is approved", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(useCurrentUser).mockReturnValue(authenticatedUser);
    vi.mocked(useMyTeacherApplication).mockReturnValue({
      authStatus: "authenticated",
      data: {
        application: {
          ...pendingApplication,
          status: "approved",
          reviewedAt: "2026-11-15T12:00:00.000Z",
        },
      },
      isError: false,
      isPending: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMyTeacherApplication>);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TeacherApplicationStatusPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: currentUserQueryKey,
      });
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "Your application was approved" }),
    ).toBeVisible();
  });
});
