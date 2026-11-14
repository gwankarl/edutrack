import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUserState } from "../../auth/hooks/useCurrentUser.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { useMyTeacherApplication } from "../hooks/useMyTeacherApplication.js";
import TeacherApplicationPage from "./TeacherApplicationPage.js";

vi.mock("../../auth/hooks/useCurrentUser.js", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useMyTeacherApplication.js", () => ({
  useMyTeacherApplication: vi.fn(),
}));

vi.mock("../components/TeacherApplicationForm.js", () => ({
  default: function MockTeacherApplicationForm() {
    return <form aria-label="Teacher application submission form" />;
  },
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

const noApplicationQuery = {
  authStatus: "authenticated",
  data: { application: null },
  error: null,
  isError: false,
  isPending: false,
  refetch: vi.fn(),
};

function renderPage(
  userState: CurrentUserState = authenticatedUser,
  applicationState: unknown = noApplicationQuery,
) {
  vi.mocked(useCurrentUser).mockReturnValue(userState);
  vi.mocked(useMyTeacherApplication).mockReturnValue(
    applicationState as unknown as ReturnType<typeof useMyTeacherApplication>,
  );

  return render(
    <MemoryRouter>
      <TeacherApplicationPage />
    </MemoryRouter>,
  );
}

describe("TeacherApplicationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains administrator review and shows the form for an eligible user", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Apply to become an EduTrack teacher",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/administrator reviews every application/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("form", { name: "Teacher application submission form" }),
    ).toBeTruthy();
  });

  it("shows a loading message while the session is being checked", () => {
    renderPage({ status: "loading", user: null, error: null });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your session",
    );
    expect(
      screen.queryByRole("form", {
        name: "Teacher application submission form",
      }),
    ).toBeNull();
  });

  it("asks an unauthenticated visitor to sign in", () => {
    renderPage({ status: "unauthenticated", user: null, error: null });

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.queryByRole("form", {
        name: "Teacher application submission form",
      }),
    ).toBeNull();
  });

  it("does not show the form while application status is loading or failed", () => {
    renderPage(authenticatedUser, {
      ...noApplicationQuery,
      data: undefined,
      isPending: true,
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your application",
    );

    renderPage(authenticatedUser, {
      ...noApplicationQuery,
      data: undefined,
      isError: true,
      isPending: false,
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load your application",
    );
  });

  it("directs applicants with a pending application to the status page", () => {
    renderPage(authenticatedUser, {
      ...noApplicationQuery,
      data: {
        application: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          status: "pending",
          motivation: "Synthetic motivation.",
          qualifications: "Synthetic qualifications.",
          submittedAt: "2026-11-14T12:00:00.000Z",
          reviewedAt: null,
          rejectionReason: null,
        },
      },
    });

    expect(
      screen.getByRole("link", { name: /view application status/i }),
    ).toHaveAttribute("href", "/teacher/application-status");
    expect(
      screen.queryByRole("form", {
        name: "Teacher application submission form",
      }),
    ).toBeNull();
  });

  it("shows approved status without offering another application", () => {
    renderPage(authenticatedUser, {
      ...noApplicationQuery,
      data: {
        application: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          status: "approved",
          motivation: "Synthetic motivation.",
          qualifications: "Synthetic qualifications.",
          submittedAt: "2026-11-14T12:00:00.000Z",
          reviewedAt: "2026-11-15T12:00:00.000Z",
          rejectionReason: null,
        },
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your application was approved",
    );
    expect(
      screen.queryByRole("form", {
        name: "Teacher application submission form",
      }),
    ).toBeNull();
  });

  it("allows a rejected applicant to submit a new application", () => {
    renderPage(authenticatedUser, {
      ...noApplicationQuery,
      data: {
        application: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          status: "rejected",
          motivation: "Previous motivation.",
          qualifications: "Previous qualifications.",
          submittedAt: "2026-11-14T12:00:00.000Z",
          reviewedAt: "2026-11-15T12:00:00.000Z",
          rejectionReason: "Please provide more relevant experience.",
        },
      },
    });

    expect(
      screen.getByText(/please provide more relevant experience/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("form", { name: "Teacher application submission form" }),
    ).toBeTruthy();
  });

  it("does not show the form to a user who already has the Teacher role", () => {
    renderPage(
      {
        ...authenticatedUser,
        user: { ...authenticatedUser.user, roles: ["student", "teacher"] },
      },
      noApplicationQuery,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "You already have Teacher access",
    );
    expect(
      screen.queryByRole("form", {
        name: "Teacher application submission form",
      }),
    ).toBeNull();
  });
});
