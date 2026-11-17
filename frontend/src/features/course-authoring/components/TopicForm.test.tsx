import type { ComponentProps, PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import TopicForm from "./TopicForm.js";

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const teacher = {
  id: "550e8400-e29b-41d4-a716-446655440099",
  displayName: "Teacher Ada",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["teacher"],
};

const topic = {
  id: topicId,
  courseId,
  title: "Linear equations",
  description: "An introduction to equations.",
  position: 3,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderTopicForm(
  props: Partial<ComponentProps<typeof TopicForm>> = {},
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
    <TopicForm
      courseId={courseId}
      onCreated={onCreated}
      onUpdated={onUpdated}
      {...props}
    />,
    { wrapper: Wrapper },
  );
  return { onCreated, onUpdated, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopicForm", () => {
  it("validates required input and creates a trimmed topic without client-controlled fields", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(topic, 201));
    vi.stubGlobal("fetch", fetchMock);
    const { onCreated } = renderTopicForm();

    await user.click(screen.getByRole("button", { name: "Create topic" }));
    expect(await screen.findByText("Enter a topic title.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(
      screen.getByRole("textbox", { name: /topic title/i }),
      "  Linear equations  ",
    );
    await user.type(
      screen.getByRole("textbox", { name: /description/i }),
      "  An introduction to equations.  ",
    );
    await user.click(screen.getByRole("button", { name: "Create topic" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(topic));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Linear equations",
          description: "An introduction to equations.",
        }),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Topic created.");
  });

  it("prepopulates and updates an existing topic, clearing an optional description", async () => {
    const user = userEvent.setup();
    const updatedTopic = { ...topic, title: "Updated equations", description: null };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updatedTopic));
    vi.stubGlobal("fetch", fetchMock);
    const { onUpdated } = renderTopicForm({ initialTopic: topic });

    const title = await screen.findByRole("textbox", { name: /topic title/i });
    expect(title).toHaveValue(topic.title);
    expect(screen.getByRole("textbox", { name: /description/i })).toHaveValue(
      topic.description,
    );

    await user.clear(title);
    await user.type(title, "Updated equations");
    await user.clear(screen.getByRole("textbox", { name: /description/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedTopic));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Updated equations",
          description: null,
        }),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Topic changes saved.",
    );
  });

  it("disables a second submission while topic creation is pending", async () => {
    const user = userEvent.setup();
    let finishRequest!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderTopicForm();

    await user.type(
      screen.getByRole("textbox", { name: /topic title/i }),
      "Linear equations",
    );
    await user.click(screen.getByRole("button", { name: "Create topic" }));

    const submitButton = await screen.findByRole("button", {
      name: "Creating topic...",
    });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();

    finishRequest(jsonResponse(topic, 201));
    expect(await screen.findByRole("status")).toHaveTextContent("Topic created.");
  });

  it("shows a safe conflict message without leaking server details", async () => {
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
    renderTopicForm({ initialTopic: topic });

    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This course is no longer a draft, so its topics cannot be changed. Refresh the page.",
    );
    expect(screen.queryByText("private database diagnostic")).toBeNull();
  });
});
