import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminTeacherApplicationParamsSchema } from "@edutrack/contracts";

import { ApiError } from "../../../../lib/api/api-error.js";
import { useTeacherApplicationDetail } from "../hooks/useTeacherApplicationDetail.js";
import TeacherApplicationReviewPage from "./TeacherApplicationReviewPage.js";
import { useTeacherApplicationDecision } from "../hooks/useTeacherApplicationDecision.js";

vi.mock("../hooks/useTeacherApplicationDetail.js", () => ({
  useTeacherApplicationDetail: vi.fn(),
}));

vi.mock("../hooks/useTeacherApplicationDecision.js", () => ({
  useTeacherApplicationDecision: vi.fn(),
}));

const applicationId = "550e8400-e29b-41d4-a716-446655440001";

const application = {
  id: applicationId,
  applicant: {
    id: "550e8400-e29b-41d4-a716-446655440002",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  motivation: "I want to support students.",
  qualifications: "Synthetic teaching background.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

const useDetailMock = vi.mocked(useTeacherApplicationDetail);

function readyResult(overrides: Record<string, unknown> = {}) {
  return {
    authorizationStatus: "authorized",
    validationError: null,
    data: application,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTeacherApplicationDetail>;
}

function renderReviewPage(
  initialEntry: string | { pathname: string; state?: { from?: string } } = {
    pathname: `/admin/teacher-applications/${applicationId}`,
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/admin/teacher-applications/:applicationId"
            element={<TeacherApplicationReviewPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useTeacherApplicationDecision).mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isSuccess: false,
    reset: vi.fn(),
    submitDecision: vi.fn(),
  } as unknown as ReturnType<typeof useTeacherApplicationDecision>);
});

describe("TeacherApplicationReviewPage", () => {
  it("loads the route ID, displays the application, and preserves a safe return path", () => {
    useDetailMock.mockReturnValue(readyResult());

    renderReviewPage({
      pathname: `/admin/teacher-applications/${applicationId}`,
      state: { from: "/admin/teacher-applications?status=pending&page=2" },
    });

    expect(useDetailMock).toHaveBeenCalledWith(applicationId);
    expect(
      screen.getByRole("heading", { name: "Teacher application" }),
    ).toBeVisible();
    expect(screen.getByText("Synthetic Applicant")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Applications" }),
    ).toHaveAttribute(
      "href",
      "/admin/teacher-applications?status=pending&page=2",
    );
  });

  it("shows a loading state", () => {
    useDetailMock.mockReturnValue(
      readyResult({ data: undefined, isPending: true }),
    );

    renderReviewPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading application");
  });

  it("handles an invalid route ID without displaying application data", () => {
    const validation = adminTeacherApplicationParamsSchema.safeParse({
      applicationId: "not-a-uuid",
    });

    if (validation.success) {
      throw new Error("Expected invalid test application ID.");
    }

    useDetailMock.mockReturnValue(
      readyResult({
        data: undefined,
        isPending: true,
        validationError: validation.error,
      }),
    );

    renderReviewPage("/admin/teacher-applications/not-a-uuid");

    expect(
      screen.getByText("The application ID in this link is invalid."),
    ).toBeVisible();
    expect(screen.queryByText("Synthetic Applicant")).toBeNull();
  });

  it("shows a not-found message for a 404 response", () => {
    useDetailMock.mockReturnValue(
      readyResult({
        data: undefined,
        error: new ApiError({
          status: 404,
          title: "Not found",
          detail: "The application does not exist.",
        }),
        isError: true,
      }),
    );

    renderReviewPage();

    expect(
      screen.getByRole("heading", { name: "Application not found" }),
    ).toBeVisible();
  });

  it("shows authorization errors without rendering application data", () => {
    useDetailMock.mockReturnValue(
      readyResult({
        authorizationStatus: "forbidden",
        data: undefined,
        isPending: true,
      }),
    );

    renderReviewPage();

    expect(
      screen.getByRole("heading", { name: "Administrator access required" }),
    ).toBeVisible();
    expect(screen.queryByText("Synthetic Applicant")).toBeNull();
  });

  it("shows a retry action for server failures", () => {
    useDetailMock.mockReturnValue(
      readyResult({
        data: undefined,
        error: new ApiError({
          status: 500,
          title: "Server error",
          detail: "Internal server details must not be shown.",
        }),
        isError: true,
      }),
    );

    renderReviewPage();

    expect(
      screen.getByRole("heading", {
        name: "We couldn't load this application",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText("Internal server details must not be shown."),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("shows decisions only when the loaded application is pending", () => {
    useDetailMock.mockReturnValue(readyResult());

    const { unmount } = renderReviewPage();

    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();

    unmount();

    useDetailMock.mockReturnValue(
      readyResult({
        data: {
          ...application,
          status: "approved",
          reviewedAt: "2026-11-15T12:00:00.000Z",
          reviewer: {
            id: "550e8400-e29b-41d4-a716-446655440003",
            displayName: "Synthetic Administrator",
            email: "administrator@example.test",
          },
        },
      }),
    );

    renderReviewPage();

    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
