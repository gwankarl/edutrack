import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CreateCoursePage from "./CreateCoursePage.js";

const levelId = "550e8400-e29b-41d4-a716-446655440001";
const subjectId = "550e8400-e29b-41d4-a716-446655440010";
const courseId = "550e8400-e29b-41d4-a716-446655440020";

const levels = [
  {
    id: levelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
];
const subjects = [
  { id: subjectId, code: "mathematics", name: "Mathematics", sortOrder: 1 },
];
const createdCourse = {
  id: courseId,
  title: "Algebra Foundations",
  description: null,
  academicLevel: levels[0],
  subject: subjects[0],
  status: "draft",
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function LocationOutput() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(currentUserQueryKey, {
    id: "550e8400-e29b-41d4-a716-446655440099",
    displayName: "Teacher Ada",
    email: "ada@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles: ["teacher"],
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/teacher/courses/new"]}>
          {children}
          <LocationOutput />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(<CreateCoursePage />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CreateCoursePage", () => {
  it("explains draft creation and navigates to the new course after success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/academic-levels")) {
        return Promise.resolve(jsonResponse({ items: levels }));
      }
      if (url.endsWith("/api/v1/subjects")) {
        return Promise.resolve(jsonResponse({ items: subjects }));
      }
      return Promise.resolve(jsonResponse(createdCourse, 201));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Create a course", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText(/New courses start as drafts/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Back to courses/ }),
    ).toHaveAttribute("href", "/teacher/courses");

    await screen.findByRole("option", { name: "Form 4" });
    await user.type(
      screen.getByRole("textbox", { name: /course title/i }),
      "Algebra Foundations",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /academic level/i }),
      levelId,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^subject/i }),
      subjectId,
    );
    await user.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Current route")).toHaveTextContent(
        `/teacher/courses/${courseId}`,
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
