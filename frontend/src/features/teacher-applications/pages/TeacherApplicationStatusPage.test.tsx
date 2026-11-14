import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUserState } from "../../auth/hooks/useCurrentUser.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
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
  vi.mocked(useCurrentUser).mockReturnValue(authenticatedUser);
  vi.mocked(useMyTeacherApplication).mockReturnValue(
    applicationState as unknown as ReturnType<typeof useMyTeacherApplication>,
  );

  return render(
    <MemoryRouter>
      <TeacherApplicationStatusPage />
    </MemoryRouter>,
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
});
