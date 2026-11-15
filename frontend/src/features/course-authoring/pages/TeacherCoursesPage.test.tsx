import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

import { useTeacherCourses } from "../hooks/useTeacherCourses.js";
import TeacherCoursesPage from "./TeacherCoursesPage.js";

vi.mock("../hooks/useTeacherCourses.js", () => ({
  useTeacherCourses: vi.fn(),
}));

const mockedUseTeacherCourses = vi.mocked(useTeacherCourses);

const course = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Introduction to Algebra",
  description: "An introduction to algebra.",
  academicLevel: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: "550e8400-e29b-41d4-a716-446655440010",
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft" as const,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:30:00.000Z",
} satisfies TeacherCourseResponse;

const listResponse: TeacherCourseListResponse = {
  items: [course],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  },
};

function createQueryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: listResponse,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    refetch: vi.fn().mockResolvedValue({ data: listResponse }),
    ...overrides,
  } as unknown as ReturnType<typeof useTeacherCourses>;
}

function renderPage(initialEntry = "/teacher/courses") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          {children}
          <LocationOutput />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  function LocationOutput() {
    const [searchParams] = useSearchParams();
    return (
      <output data-testid="search-params">{searchParams.toString()}</output>
    );
  }

  return render(<TeacherCoursesPage />, { wrapper: Wrapper });
}

describe("TeacherCoursesPage", () => {
  beforeEach(() => {
    mockedUseTeacherCourses.mockReset();
    mockedUseTeacherCourses.mockReturnValue(createQueryResult());
  });

  it("shows the course list and planned creation/details links", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Your courses", level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Create Course" })).toHaveAttribute(
      "href",
      "/teacher/courses/new",
    );
    expect(
      screen.getByRole("link", {
        name: "View details for Introduction to Algebra",
      }),
    ).toHaveAttribute(
      "href",
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020",
    );
    expect(mockedUseTeacherCourses).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  it("uses supported status filtering and resets pagination when status changes", async () => {
    const user = userEvent.setup();
    renderPage("/teacher/courses?status=published&page=3");

    expect(mockedUseTeacherCourses).toHaveBeenLastCalledWith({
      page: 3,
      pageSize: 20,
      status: "published",
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by status" }),
      "rejected",
    );

    await waitFor(() => {
      expect(mockedUseTeacherCourses).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: "rejected",
      });
    });
    expect(screen.getByTestId("search-params")).toHaveTextContent(
      "status=rejected",
    );
    expect(screen.getByTestId("search-params")).not.toHaveTextContent("page=");
  });

  it("shows a loading state", () => {
    mockedUseTeacherCourses.mockReturnValue(
      createQueryResult({ data: undefined, isPending: true }),
    );

    renderPage();
    expect(
      screen.getByText("Please wait while your courses load."),
    ).toBeVisible();
  });

  it("shows an empty state when no courses match the filter", () => {
    mockedUseTeacherCourses.mockReturnValue(
      createQueryResult({
        data: {
          items: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },
        },
      }),
    );

    renderPage();
    expect(screen.getByText("No courses yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create Course" })).toBeVisible();
  });

  it("shows a retry action after a course request fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({});
    mockedUseTeacherCourses.mockReturnValue(
      createQueryResult({ data: undefined, isError: true, refetch }),
    );

    renderPage();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does not show course data for an unauthenticated user", () => {
    mockedUseTeacherCourses.mockReturnValue(
      createQueryResult({
        data: undefined,
        isPending: true,
        authorizationStatus: "unauthenticated",
      }),
    );

    renderPage();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("Introduction to Algebra")).toBeNull();
  });
});
