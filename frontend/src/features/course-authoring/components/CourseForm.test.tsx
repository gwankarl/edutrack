import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CourseForm from "./CourseForm.js";

const levelId = "550e8400-e29b-41d4-a716-446655440001";
const subjectId = "550e8400-e29b-41d4-a716-446655440010";
const courseId = "550e8400-e29b-41d4-a716-446655440020";

const academicLevels = [
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    code: "form-1",
    name: "Form 1",
    educationStage: "lower_secondary",
    sortOrder: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    code: "form-2",
    name: "Form 2",
    educationStage: "lower_secondary",
    sortOrder: 2,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440004",
    code: "form-3",
    name: "Form 3",
    educationStage: "lower_secondary",
    sortOrder: 3,
  },
  {
    id: levelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440005",
    code: "form-5",
    name: "Form 5",
    educationStage: "lower_secondary",
    sortOrder: 5,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440006",
    code: "lower-sixth",
    name: "Lower Sixth",
    educationStage: "upper_secondary",
    sortOrder: 6,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440007",
    code: "upper-sixth",
    name: "Upper Sixth",
    educationStage: "upper_secondary",
    sortOrder: 7,
  },
];

const subjects = [
  { id: subjectId, code: "mathematics", name: "Mathematics", sortOrder: 1 },
];

const createdCourse = {
  id: courseId,
  title: "Algebra Foundations",
  description: null,
  academicLevel: academicLevels[3],
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

function setupFetch(options: { createResponse?: Response } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/v1/academic-levels")) {
      return Promise.resolve(jsonResponse({ items: academicLevels }));
    }
    if (url.endsWith("/api/v1/subjects")) {
      return Promise.resolve(jsonResponse({ items: subjects }));
    }
    if (url === "/api/v1/teacher/courses" && init?.method === "POST") {
      return Promise.resolve(
        options.createResponse ?? jsonResponse(createdCourse, 201),
      );
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderForm(onCreated = vi.fn()) {
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

  render(<CourseForm onCreated={onCreated} />, { wrapper: Wrapper });
  return { onCreated, queryClient };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
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
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CourseForm", () => {
  it("loads catalog choices and submits a draft without client-controlled ownership or status", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch();
    const { onCreated } = renderForm();

    expect(
      await screen.findByRole("option", { name: "Lower Sixth" }),
    ).toBeInTheDocument();
    for (const levelName of [
      "Form 1",
      "Form 2",
      "Form 3",
      "Form 4",
      "Form 5",
      "Upper Sixth",
    ]) {
      expect(
        screen.getByRole("option", { name: levelName }),
      ).toBeInTheDocument();
    }
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdCourse));
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/v1/teacher/courses" && init?.method === "POST",
    );
    expect(createCall).toBeDefined();
    const requestBody = JSON.parse(String(createCall?.[1]?.body));
    expect(requestBody).toEqual({
      title: "Algebra Foundations",
      academicLevelId: levelId,
      subjectId,
    });
    expect(requestBody).not.toHaveProperty("teacherId");
    expect(requestBody).not.toHaveProperty("status");
  });

  it("shows accessible validation messages and does not submit invalid form data", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch();
    renderForm();

    await screen.findByRole("option", { name: "Lower Sixth" });
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByText("Enter a course title.")).toBeVisible();
    expect(screen.getByText("Choose an academic level.")).toBeVisible();
    expect(screen.getByText("Choose a subject.")).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === "/api/v1/teacher/courses" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("disables duplicate submission while the create request is pending", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/academic-levels")) {
        return Promise.resolve(jsonResponse({ items: academicLevels }));
      }
      if (url.endsWith("/api/v1/subjects")) {
        return Promise.resolve(jsonResponse({ items: subjects }));
      }
      return new Promise<Response>((resolve) => {
        resolveCreate = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    await screen.findByRole("option", { name: "Lower Sixth" });
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(
      await screen.findByRole("button", { name: "Creating course…" }),
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => String(url) === "/api/v1/teacher/courses",
      ),
    ).toHaveLength(1);
    resolveCreate(jsonResponse(createdCourse, 201));
    await screen.findByText("Course created. Opening its details…");
  });

  it("shows a safe API conflict message without exposing response internals", async () => {
    const user = userEvent.setup();
    setupFetch({
      createResponse: jsonResponse(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "private database diagnostic",
        },
        409,
      ),
    });
    renderForm();

    await screen.findByRole("option", { name: "Lower Sixth" });
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create the course with these catalog choices. Refresh and try again.",
    );
    expect(
      screen.queryByText("private database diagnostic"),
    ).not.toBeInTheDocument();
  });
});
