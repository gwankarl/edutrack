import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CourseForm from "./CourseForm.js";

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const levelId = "550e8400-e29b-41d4-a716-446655440001";
const subjectId = "550e8400-e29b-41d4-a716-446655440010";

const academicLevels = [
  {
    id: levelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary" as const,
    sortOrder: 4,
  },
];
const subjects = [
  { id: subjectId, code: "mathematics", name: "Mathematics", sortOrder: 1 },
];
const existingCourse = {
  id: courseId,
  title: "Existing Algebra Course",
  description: "An existing description.",
  academicLevel: academicLevels[0],
  subject: subjects[0],
  status: "draft",
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:30:00.000Z",
} satisfies TeacherCourseResponse;
const updatedCourse = {
  ...existingCourse,
  title: "Updated course title",
  description: null,
  updatedAt: "2026-11-17T12:30:00.000Z",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderEditForm() {
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
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  const onUpdated = vi.fn();
  render(<CourseForm initialCourse={existingCourse} onUpdated={onUpdated} />, {
    wrapper: Wrapper,
  });
  return { onUpdated, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CourseForm editing", () => {
  it("prepopulates a Draft and sends editable fields through the update contract", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/v1/academic-levels")) {
        return Promise.resolve(jsonResponse({ items: academicLevels }));
      }
      if (url.endsWith("/api/v1/subjects")) {
        return Promise.resolve(jsonResponse({ items: subjects }));
      }
      if (
        url === `/api/v1/teacher/courses/${courseId}` &&
        init?.method === "PATCH"
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(updatedCourse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onUpdated } = renderEditForm();

    await screen.findByRole("option", { name: "Form 4" });
    const title = await screen.findByRole("textbox", { name: /course title/i });
    expect(title).toHaveValue("Existing Algebra Course");
    expect(screen.getByRole("textbox", { name: /description/i })).toHaveValue(
      "An existing description.",
    );
    expect(
      screen.getByRole("combobox", { name: /academic level/i }),
    ).toHaveValue(levelId);
    expect(screen.getByRole("combobox", { name: /^subject/i })).toHaveValue(
      subjectId,
    );

    await user.clear(title);
    await user.type(title, "Updated course title");
    await user.clear(screen.getByRole("textbox", { name: /description/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedCourse));
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `/api/v1/teacher/courses/${courseId}` &&
        init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      title: "Updated course title",
      description: null,
      academicLevelId: levelId,
      subjectId,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Course changes saved.",
    );
  });

  it("explains when a concurrent status change makes the Draft read-only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/v1/academic-levels")) {
        return Promise.resolve(jsonResponse({ items: academicLevels }));
      }
      if (url.endsWith("/api/v1/subjects")) {
        return Promise.resolve(jsonResponse({ items: subjects }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "private database diagnostic",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderEditForm();

    await screen.findByRole("option", { name: "Form 4" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This course is no longer a draft and cannot be edited. Refresh to see its current details.",
    );
    expect(
      screen.queryByText("private database diagnostic"),
    ).not.toBeInTheDocument();
  });
});
