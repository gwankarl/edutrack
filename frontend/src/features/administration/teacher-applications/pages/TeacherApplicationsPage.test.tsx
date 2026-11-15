import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTeacherApplications } from "../hooks/useTeacherApplications.js";
import TeacherApplicationsPage from "./TeacherApplicationsPage.js";

vi.mock("../hooks/useTeacherApplications.js", () => ({
  useTeacherApplications: vi.fn(),
}));

const application = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  applicant: {
    id: "550e8400-e29b-41d4-a716-446655440002",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  motivation: "I want to support students.",
  qualifications: "Synthetic teaching background.",
  submittedAt: "2026-01-10T12:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

const firstPage = {
  items: [application],
  pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 },
};

const secondPage = {
  items: [application],
  pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
};

const mockedUseTeacherApplications = vi.mocked(useTeacherApplications);

beforeEach(() => {
  vi.clearAllMocks();
});

function LocationProbe() {
  const location = useLocation();

  return (
    <output aria-label="Current location">
      {location.pathname}
      {location.search}
      {location.state ? JSON.stringify(location.state) : ""}
    </output>
  );
}

function renderPage(initialEntry = "/admin/teacher-applications") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TeacherApplicationsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherApplicationsPage", () => {
  it("shows the list and resets pagination when the status filter changes", async () => {
    const user = userEvent.setup();

    mockedUseTeacherApplications.mockImplementation((filters = {}) => {
      const data = filters.page === 2 ? secondPage : firstPage;
      return {
        authorizationStatus: "authorized",
        data,
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useTeacherApplications>;
    });

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Teacher applications" }),
    ).toBeVisible();
    expect(screen.getByText("Synthetic Applicant")).toBeVisible();
    expect(screen.getByText("Page 1 of 2 · 21 applications")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockedUseTeacherApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(screen.getByText("Page 2 of 2 · 21 applications")).toBeVisible();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by status" }),
      "rejected",
    );

    await waitFor(() =>
      expect(mockedUseTeacherApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: "rejected" }),
      ),
    );
  });

  it("shows a loading message while the list is pending", () => {
    mockedUseTeacherApplications.mockReturnValue({
      authorizationStatus: "authorized",
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplications>);

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Loading applications" }),
    ).toBeVisible();
  });

  it("offers a retry when loading applications fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    mockedUseTeacherApplications.mockReturnValue({
      authorizationStatus: "authorized",
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useTeacherApplications>);

    renderPage();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows an empty state when there are no results", () => {
    mockedUseTeacherApplications.mockReturnValue({
      authorizationStatus: "authorized",
      data: {
        items: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplications>);

    renderPage();

    expect(
      screen.getByText("There are no teacher applications to review."),
    ).toBeVisible();
  });

  it("keeps filter and page in the URL and passes that return location to details", async () => {
    const user = userEvent.setup();

    mockedUseTeacherApplications.mockImplementation((filters = {}) => {
      return {
        authorizationStatus: "authorized",
        data: filters.page === 2 ? secondPage : firstPage,
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useTeacherApplications>;
    });

    renderPage("/admin/teacher-applications?status=pending&page=2");

    expect(mockedUseTeacherApplications).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", page: 2 }),
    );

    await user.click(
      screen.getByRole("link", {
        name: "View details for Synthetic Applicant",
      }),
    );

    expect(screen.getByLabelText("Current location")).toHaveTextContent(
      '/admin/teacher-applications/550e8400-e29b-41d4-a716-446655440001{"from":"/admin/teacher-applications?status=pending&page=2"}',
    );
  });
});
