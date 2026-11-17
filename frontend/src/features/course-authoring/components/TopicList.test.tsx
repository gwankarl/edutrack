import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherTopicResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useReorderCourseTopics } from "../hooks/useContentReordering.js";
import TopicList from "./TopicList.js";

vi.mock("../hooks/useContentReordering.js", () => ({
  useReorderCourseTopics: vi.fn(),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topics = [
  {
    id: "550e8400-e29b-41d4-a716-446655440021",
    courseId,
    title: "Linear equations",
    description: "An introduction to equations.",
    position: 1,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440022",
    courseId,
    title: "Inequalities",
    description: null,
    position: 2,
    createdAt: "2026-11-16T12:00:00.000Z",
    updatedAt: "2026-11-16T12:00:00.000Z",
  },
] satisfies TeacherTopicResponse[];

const reorderMutation = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as unknown,
};

function renderList(canManage: boolean, topicItems = topics) {
  return render(
    <MemoryRouter>
      <TopicList canManage={canManage} courseId={courseId} topics={topicItems} />
    </MemoryRouter>,
  );
}

describe("TopicList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reorderMutation.isPending = false;
    reorderMutation.isSuccess = false;
    reorderMutation.isError = false;
    reorderMutation.error = null;
    vi.mocked(useReorderCourseTopics).mockReturnValue(
      reorderMutation as unknown as ReturnType<typeof useReorderCourseTopics>,
    );
  });

  it("renders backend order, topic details, and Draft management links", () => {
    renderList(true);

    expect(
      screen.getByRole("table", { name: "Topics in this course" }),
    ).toBeVisible();
    expect(screen.getByText("Linear equations")).toBeVisible();
    expect(screen.getByText("An introduction to equations.")).toBeVisible();
    expect(screen.getByText("Inequalities")).toBeVisible();
    expect(screen.getByText("No description provided.")).toBeVisible();
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Add Topic" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/new`,
    );
    expect(
      screen.getByRole("link", { name: "View or edit topic Linear equations" }),
    ).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topics[0].id}`,
    );
    expect(screen.getByRole("button", { name: "Move topic Linear equations up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move topic Inequalities down" })).toBeDisabled();
  });

  it("shows topic information without management actions when read-only", () => {
    renderList(false);

    expect(screen.getByText("Linear equations")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add Topic" })).toBeNull();
    expect(screen.queryByRole("link", { name: /view or edit topic/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move topic/i })).toBeNull();
  });

  it("shows an appropriate empty state and only offers creation when editable", () => {
    const { rerender } = render(
      <MemoryRouter>
        <TopicList canManage courseId={courseId} topics={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "This course has no topics yet.",
    );
    expect(screen.getByRole("link", { name: "Add Topic" })).toBeVisible();

    rerender(
      <MemoryRouter>
        <TopicList canManage={false} courseId={courseId} topics={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "This course does not have any topics.",
    );
    expect(screen.queryByRole("link", { name: "Add Topic" })).toBeNull();
  });

  it("submits the complete swapped topic order and renders refreshed backend order", async () => {
    const user = userEvent.setup();
    const rendered = renderList(true);

    await user.click(
      screen.getByRole("button", { name: "Move topic Linear equations down" }),
    );

    expect(reorderMutation.mutate).toHaveBeenCalledWith({
      topicIds: [topics[1].id, topics[0].id],
    });

    rendered.rerender(
      <MemoryRouter>
        <TopicList
          canManage
          courseId={courseId}
          topics={[
            { ...topics[1], position: 1 },
            { ...topics[0], position: 2 },
          ]}
        />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Inequalities");
    expect(rows[2]).toHaveTextContent("Linear equations");
  });

  it("disables controls while pending and reports safe success or conflict feedback", () => {
    reorderMutation.isPending = true;
    const { rerender } = renderList(true);
    expect(screen.getByRole("status")).toHaveTextContent("Saving topic order");
    expect(screen.getByRole("button", { name: "Move topic Linear equations down" })).toBeDisabled();

    reorderMutation.isPending = false;
    reorderMutation.isSuccess = true;
    rerender(
      <MemoryRouter>
        <TopicList canManage courseId={courseId} topics={topics} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Topic order updated.");

    reorderMutation.isSuccess = false;
    reorderMutation.isError = true;
    reorderMutation.error = new ApiError({ status: 409, title: "Conflict" });
    rerender(
      <MemoryRouter>
        <TopicList canManage courseId={courseId} topics={topics} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The course is no longer a draft");
  });
});
