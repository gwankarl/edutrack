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
const thumbnail = {
  url: "https://images.example.test/course.webp",
  width: 1600,
  height: 900,
  format: "webp" as const,
};
const course = {
  id: courseId,
  title: "Algebra Foundations",
  description: null,
  academicLevel: {
    id: levelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary" as const,
    sortOrder: 4,
  },
  subject: {
    id: subjectId,
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft" as const,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
} satisfies TeacherCourseResponse;

const existingCourse = { ...course, thumbnail };

const levels = [course.academicLevel];
const subjects = [course.subject];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setupFetch(
  options: {
    uploadResponses?: Response[];
    courseResponse?: Response;
  } = {},
) {
  const uploads = [...(options.uploadResponses ?? [])];
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith("/api/v1/academic-levels")) {
      return Promise.resolve(json({ items: levels }));
    }
    if (url.endsWith("/api/v1/subjects")) {
      return Promise.resolve(json({ items: subjects }));
    }
    if (url === "/api/v1/teacher/courses" && init?.method === "POST") {
      return Promise.resolve(options.courseResponse ?? json(course, 201));
    }
    if (
      url === `/api/v1/teacher/courses/${courseId}` &&
      init?.method === "PATCH"
    ) {
      return Promise.resolve(json(course));
    }
    if (
      url === `/api/v1/teacher/courses/${courseId}/thumbnail` &&
      init?.method === "POST"
    ) {
      return Promise.resolve(uploads.shift() ?? json({ thumbnail }));
    }
    if (
      url === `/api/v1/teacher/courses/${courseId}/thumbnail` &&
      init?.method === "DELETE"
    ) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function renderForm({
  initialCourse,
  onCreated = vi.fn(),
  onUpdated = vi.fn(),
}: {
  initialCourse?: TeacherCourseResponse;
  onCreated?: (value: TeacherCourseResponse) => void;
  onUpdated?: (value: TeacherCourseResponse) => void;
} = {}) {
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

  const view = render(
    <CourseForm
      initialCourse={initialCourse}
      onCreated={onCreated}
      onUpdated={onUpdated}
    />,
    { wrapper: Wrapper },
  );

  return { onCreated, onUpdated, queryClient, unmount: view.unmount };
}

async function fillCourse(user: ReturnType<typeof userEvent.setup>) {
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

function imageFile(name = "cover.webp", type = "image/webp", bytes = 128) {
  return new File([new Uint8Array(bytes)], name, { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CourseForm course thumbnails", () => {
  it("shows an accessible empty state without an existing thumbnail", async () => {
    setupFetch();
    renderForm();

    await screen.findByRole("option", { name: "Form 4" });

    expect(screen.getByText("No course cover image selected.")).toBeVisible();
    expect(screen.getByLabelText("Course cover image")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(screen.queryByRole("button", { name: "Remove image" })).toBeNull();
  });

  it("previews the selected local file immediately without uploading it", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { unmount } = renderForm();

    await screen.findByRole("option", { name: "Form 4" });
    await user.upload(screen.getByLabelText("Course cover image"), imageFile());

    expect(
      await screen.findByRole("img", { name: "Selected course cover preview" }),
    ).toHaveAttribute("src", "blob:local-preview");
    expect(screen.getByText(/not uploaded yet/i)).toBeVisible();
    expect(calls.some((call) => call.url.endsWith("/thumbnail"))).toBe(false);

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
  });

  it("reports unsupported formats and files larger than 5 MB accessibly", async () => {
    // Bypass the browser picker filter to exercise our own accessible errors.
    const user = userEvent.setup({ applyAccept: false });
    setupFetch();
    renderForm();

    await screen.findByRole("option", { name: "Form 4" });
    await user.upload(
      screen.getByLabelText("Course cover image"),
      imageFile("cover.gif", "image/gif"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, or WebP image.",
    );

    await user.upload(
      screen.getByLabelText("Course cover image"),
      imageFile("large.png", "image/png", 5 * 1024 * 1024 + 1),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The image must be 5 MB or smaller.",
    );
  });

  it("creates the course first, then uploads the image, then calls onCreated", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch({
      uploadResponses: [json({ thumbnail })],
    });
    const { onCreated } = renderForm();

    await screen.findByRole("option", { name: "Form 4" });
    await fillCourse(user);
    await user.upload(screen.getByLabelText("Course cover image"), imageFile());
    expect(calls.some((call) => call.url.endsWith("/thumbnail"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Create course" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const createIndex = calls.findIndex(
      (call) =>
        call.url === "/api/v1/teacher/courses" && call.init?.method === "POST",
    );
    const uploadIndex = calls.findIndex(
      (call) => call.url.endsWith("/thumbnail") && call.init?.method === "POST",
    );
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(createIndex);
    expect(calls[uploadIndex]?.init?.body).toBeInstanceOf(FormData);
    expect(calls[uploadIndex]?.init?.headers).not.toHaveProperty(
      "Content-Type",
    );
    expect(onCreated).toHaveBeenCalledWith({ ...course, thumbnail });
  });

  it("creates successfully without an image and does not call the upload endpoint", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch();
    const { onCreated } = renderForm();

    await screen.findByRole("option", { name: "Form 4" });
    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(course));
    expect(calls.some((call) => call.url.endsWith("/thumbnail"))).toBe(false);
  });

  it("retries a failed upload without posting a second course", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch({
      uploadResponses: [
        json({ title: "Request failed", status: 502 }, 502),
        json({ thumbnail }),
      ],
    });
    const { onCreated } = renderForm();

    await screen.findByRole("option", { name: "Form 4" });
    await fillCourse(user);
    await user.upload(screen.getByLabelText("Course cover image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(
      await screen.findByRole("button", { name: "Retry image operation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Selected course cover preview" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Retry image operation" }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    expect(
      calls.filter(
        (call) =>
          call.url === "/api/v1/teacher/courses" &&
          call.init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (call) =>
          call.url.endsWith("/thumbnail") && call.init?.method === "POST",
      ),
    ).toHaveLength(2);
  });

  it("replaces an existing Draft image through the backend", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch({
      uploadResponses: [json({ thumbnail })],
    });
    const { onUpdated } = renderForm({ initialCourse: existingCourse });

    await screen.findByRole("option", { name: "Form 4" });
    expect(
      screen.getByRole("img", { name: "Current course cover image" }),
    ).toHaveAttribute("src", existingCourse.thumbnail.url);

    await user.upload(screen.getByLabelText("Course cover image"), imageFile());
    expect(
      screen.getByRole("img", { name: "Selected course cover preview" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...course, thumbnail }),
    );
    expect(calls.some((call) => call.init?.method === "PATCH")).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.init?.method === "POST" && call.url.endsWith("/thumbnail"),
      ),
    ).toBe(true);
  });

  it("removes an existing Draft image through DELETE", async () => {
    const user = userEvent.setup();
    const { calls } = setupFetch();
    const { onUpdated } = renderForm({ initialCourse: existingCourse });

    await screen.findByRole("option", { name: "Form 4" });
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...course, thumbnail: null }),
    );
    expect(
      calls.some(
        (call) =>
          call.url.endsWith("/thumbnail") && call.init?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("does not allow editing a non-Draft course", async () => {
    setupFetch();
    renderForm({ initialCourse: { ...existingCourse, status: "published" } });

    await screen.findByRole("option", { name: "Form 4" });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByLabelText("Course cover image")).toBeDisabled();
    expect(screen.getByText("Only Draft courses can be edited.")).toBeVisible();
  });
});
