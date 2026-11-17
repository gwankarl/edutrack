import type { ComponentProps, PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import LessonForm from "./LessonForm.js";

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const lessonId = "550e8400-e29b-41d4-a716-446655440022";
const teacher = {
  id: "550e8400-e29b-41d4-a716-446655440099",
  displayName: "Teacher Ada",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["teacher"],
};

const lesson = {
  id: lessonId,
  topicId,
  title: "Solving equations",
  content: {
    blocks: [
      { type: "paragraph", text: "Isolate the unknown." },
      { type: "paragraph", text: "Check the result." },
    ],
  },
  position: 4,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderLessonForm(
  props: Partial<ComponentProps<typeof LessonForm>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(currentUserQueryKey, teacher);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  const onCreated = vi.fn();
  const onUpdated = vi.fn();
  render(
    <LessonForm
      courseId={courseId}
      onCreated={onCreated}
      onUpdated={onUpdated}
      topicId={topicId}
      {...props}
    />,
    { wrapper: Wrapper },
  );
  return { onCreated, onUpdated, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LessonForm", () => {
  it("requires a title and creates a trimmed lesson with structured Tiptap content", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(lesson, 201));
    vi.stubGlobal("fetch", fetchMock);
    const { onCreated } = renderLessonForm();

    await user.click(screen.getByRole("button", { name: "Create Lesson" }));
    expect(await screen.findByText("Enter a lesson title.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(
      screen.getByRole("textbox", { name: /lesson title/i }),
      "  Solving equations  ",
    );
    await user.type(
      await screen.findByRole("textbox", { name: /lesson content/i }),
      "Isolate the unknown.",
    );
    await user.click(screen.getByRole("button", { name: "Create Lesson" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(lesson));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Solving equations",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Isolate the unknown." }],
              },
            ],
          },
        }),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Lesson created.");
  });

  it("converts legacy content for editing and saves it in Tiptap JSON format", async () => {
    const user = userEvent.setup();
    const updatedLesson = { ...lesson, title: "Updated lesson", content: null };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updatedLesson));
    vi.stubGlobal("fetch", fetchMock);
    const { onUpdated } = renderLessonForm({ initialLesson: lesson });

    const title = await screen.findByRole("textbox", { name: /lesson title/i });
    expect(title).toHaveValue(lesson.title);
    expect(await screen.findByRole("textbox", { name: /lesson content/i })).toHaveTextContent(
      "Isolate the unknown.",
    );
    expect(screen.getByRole("textbox", { name: /lesson content/i })).toHaveTextContent(
      "Check the result.",
    );

    await user.clear(title);
    await user.type(title, "Updated lesson");
    await user.clear(await screen.findByRole("textbox", { name: /lesson content/i }));
    await user.click(screen.getByRole("button", { name: "Save Lesson" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedLesson));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Updated lesson",
          content: { type: "doc", content: [{ type: "paragraph" }] },
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "All changes saved",
    );
  });

  it("disables another submit while a lesson request is pending", async () => {
    const user = userEvent.setup();
    let finishRequest!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderLessonForm();

    await user.type(
      screen.getByRole("textbox", { name: /lesson title/i }),
      "Solving equations",
    );
    await user.click(screen.getByRole("button", { name: "Create Lesson" }));

    expect(
      await screen.findByRole("button", { name: "Creating lesson..." }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();

    finishRequest(jsonResponse(lesson, 201));
    expect(await screen.findByText("Lesson created.")).toBeVisible();
  });

  it("shows a safe Draft conflict error without exposing server details", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            title: "Conflict",
            status: 409,
            detail: "private database diagnostic",
          },
          409,
        ),
      ),
    );
    renderLessonForm({ initialLesson: lesson });

    await user.click(await screen.findByRole("button", { name: "Save Lesson" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This course is no longer a draft, so its lessons cannot be changed. Refresh the page.",
    );
    expect(screen.queryByText("private database diagnostic")).toBeNull();
  });

  it("switches between Edit and Preview without losing form content", async () => {
    const user = userEvent.setup();
    renderLessonForm({ initialLesson: lesson });

    const editor = await screen.findByRole("textbox", { name: "Lesson content" });
    await user.type(editor, " Add an example.");

    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(
      screen.getByRole("textbox", { name: "Lesson content preview" }),
    ).toHaveTextContent("Add an example.");

    await user.click(screen.getByRole("tab", { name: "Edit" }));
    expect(await screen.findByRole("textbox", { name: "Lesson content" })).toHaveTextContent(
      "Add an example.",
    );
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("clears the unsaved state and reports saved after a successful update", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ...lesson, title: "Saved lesson" }),
      ),
    );
    renderLessonForm({ initialLesson: lesson });

    const title = await screen.findByRole("textbox", { name: /lesson title/i });
    await user.clear(title);
    await user.type(title, "Saved lesson");
    await user.click(screen.getByRole("button", { name: "Save Lesson" }));

    expect(await screen.findByText("All changes saved")).toBeVisible();
  });
});
