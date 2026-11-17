import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TeacherDashboardSummaryResponse } from "@edutrack/contracts";
import TeacherWorkspacePage from "./TeacherWorkspacePage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const currentUser = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  displayName: "Ada Teacher",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["teacher"],
};

const populatedSummary: TeacherDashboardSummaryResponse = {
  statusCounts: {
    total: 5,
    draft: 2,
    pendingReview: 1,
    published: 2,
    rejected: 0,
  },
  recentDraftCourses: [
    {
      id: "550e8400-e29b-41d4-a716-446655440021",
      title: "Algebra Foundations",
      status: "draft",
      updatedAt: "2026-11-16T10:00:00.000Z",
    },
  ],
};

function makeSummary(
  statusCounts: TeacherDashboardSummaryResponse["statusCounts"],
  recentDraftCourses: TeacherDashboardSummaryResponse["recentDraftCourses"] = [],
): TeacherDashboardSummaryResponse {
  return { statusCounts, recentDraftCourses };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function mockDashboardApi(
  summary: unknown = populatedSummary,
  summaryStatus = 200,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input);

    if (path === "/api/v1/auth/me") {
      return Promise.resolve(jsonResponse(currentUser));
    }

    if (path === "/api/v1/teacher/dashboard/summary") {
      return Promise.resolve(jsonResponse(summary, summaryStatus));
    }

    return Promise.reject(new Error(`Unexpected test request: ${path}`));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function CurrentPath() {
  const location = useLocation();

  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderPage(initialPath = "/teacher") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <CurrentPath />
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(
    <Wrapper>
      <TeacherWorkspacePage />
    </Wrapper>,
  );
}

describe("TeacherWorkspacePage", () => {
  it("renders the welcome, real course statistics, recent drafts, and actions", async () => {
    const fetchMock = mockDashboardApi();

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Welcome, Ada Teacher!",
      }),
    ).toBeVisible();
    await screen.findByRole("article", { name: "Total Courses summary" });

    expect(
      screen.getByRole("heading", { name: "Course summary" }),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "Total Courses summary" }),
    ).toHaveTextContent("5");
    expect(
      screen.getByRole("article", { name: "Draft Courses summary" }),
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("article", { name: "In Review summary" }),
    ).toHaveTextContent("1");
    expect(
      screen.getByRole("article", { name: "Published summary" }),
    ).toHaveTextContent("2");

    expect(
      screen.getByRole("link", { name: "Open course: Algebra Foundations" }),
    ).toHaveAttribute(
      "href",
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440021",
    );
    expect(screen.getByRole("link", { name: "Create Course" })).toHaveAttribute(
      "href",
      "/teacher/courses/new",
    );
    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "href",
      "/teacher/courses",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/dashboard/summary",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it.each([
    ["Create Course", "/teacher/courses/new"],
    ["My Courses", "/teacher/courses"],
  ])("navigates through the %s quick action", async (label, destination) => {
    const user = userEvent.setup();
    mockDashboardApi();

    renderPage();

    await screen.findByRole("heading", { name: "Welcome, Ada Teacher!" });
    await user.click(screen.getByRole("link", { name: label }));

    expect(screen.getByTestId("current-path")).toHaveTextContent(destination);
  });

  it("shows the first-time teacher empty state when there are no courses", async () => {
    mockDashboardApi(
      makeSummary({
        total: 0,
        draft: 0,
        pendingReview: 0,
        published: 0,
        rejected: 0,
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Start your first course" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create your first course" }),
    ).toHaveAttribute("href", "/teacher/courses/new");
    expect(
      screen.getByRole("article", { name: "Total Courses summary" }),
    ).toHaveTextContent("0");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("shows a separate no-recent-drafts state when the teacher has courses", async () => {
    mockDashboardApi(
      makeSummary({
        total: 1,
        draft: 0,
        pendingReview: 0,
        published: 1,
        rejected: 0,
      }),
    );

    renderPage();

    expect(
      await screen.findByText("You do not have any Draft courses yet."),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Start your first course" }),
    ).not.toBeInTheDocument();
  });

  it("keeps supported zero status counts distinct from unavailable values", async () => {
    mockDashboardApi(
      makeSummary({
        total: 3,
        draft: 0,
        pendingReview: 0,
        published: 3,
        rejected: 0,
      }),
    );

    renderPage();

    await screen.findByRole("article", { name: "Draft Courses summary" });

    expect(
      screen.getByRole("article", { name: "Draft Courses summary" }),
    ).toHaveTextContent("0");
    expect(
      screen.getByRole("article", { name: "In Review summary" }),
    ).toHaveTextContent("0");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("shows loading feedback while the authenticated session is being checked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your Teacher workspace",
    );
  });

  it("shows a safe dashboard error instead of fabricated zero counts", async () => {
    mockDashboardApi(
      {
        title: "Service unavailable",
        status: 503,
        detail: "Try again later.",
      },
      503,
    );

    renderPage();

    expect(
      await screen.findByText(
        "We couldn't load your course summary.",
        { selector: "p" },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(
      screen.getByText("We couldn't load your Draft courses."),
    ).toBeVisible();
    expect(
      screen.queryByRole("article", { name: "Total Courses summary" }),
    ).not.toBeInTheDocument();
  });

  it("preserves the sign-in fallback for an unauthenticated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            title: "Authentication required",
            status: 401,
            detail: "A valid session is required.",
          },
          401,
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to view this workspace",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
