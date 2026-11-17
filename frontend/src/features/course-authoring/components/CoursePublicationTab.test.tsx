import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";

import CoursePublicationTab from "./CoursePublicationTab.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import { useTeacherQuizzes } from "../hooks/useQuizAuthoring.js";

vi.mock("../hooks/useCourseTopics.js", () => ({
  useCourseTopics: vi.fn(),
}));
vi.mock("../hooks/useTopicLessons.js", () => ({
  useTopicLessons: vi.fn(),
}));
vi.mock("../hooks/useQuizAuthoring.js", () => ({
  useTeacherQuizzes: vi.fn(),
}));

const course = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Algebra Foundations",
  description: null,
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
  status: "draft",
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
} satisfies TeacherCourseResponse;

const topic = {
  id: "550e8400-e29b-41d4-a716-446655440021",
  courseId: course.id,
  title: "Linear equations",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
} satisfies TeacherTopicResponse;

const mockedTopics = vi.mocked(useCourseTopics);
const mockedLessons = vi.mocked(useTopicLessons);
const mockedQuizzes = vi.mocked(useTeacherQuizzes);

function query(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

function renderTab(courseValue: TeacherCourseResponse = course) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CoursePublicationTab course={courseValue} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTopics.mockReturnValue(query({ items: [topic] }));
  mockedLessons.mockReturnValue(
    query({ items: [{ id: "lesson-1" }, { id: "lesson-2" }] }),
  );
  mockedQuizzes.mockReturnValue(query({ items: [{ id: "quiz-1" }] }));
});

describe("CoursePublicationTab", () => {
  it.each([
    ["draft", "Draft", /work in progress/i],
    [
      "pending_review",
      "Pending review",
      /current course status is Pending review/i,
    ],
    ["published", "Published", /current course status is Published/i],
    ["rejected", "Rejected", /current course status is Rejected/i],
  ] as const)(
    "shows neutral information for %s",
    (status, label, explanation) => {
      renderTab({ ...course, status });

      expect(
        screen.getByLabelText(`Current course status: ${label}`),
      ).toBeVisible();
      expect(screen.getByText(explanation)).toBeVisible();
      expect(screen.getByText(/Final submission eligibility/i)).toBeVisible();
    },
  );

  it.each(["unauthenticated", "forbidden", "error"] as const)(
    "shows topic information as unavailable when authorization is %s",
    (authorizationStatus) => {
      mockedTopics.mockReturnValue(
        query(undefined, {
          authorizationStatus,
          isPending: true,
          isSuccess: false,
        }),
      );

      renderTab();

      expect(
        screen.getByText(
          "Topic information is unavailable because Teacher access could not be confirmed.",
        ),
      ).toBeVisible();
      expect(screen.queryByText("Checking topics.")).not.toBeInTheDocument();
    },
  );

  it("shows Submit for Review disabled and marked Coming Soon only for Draft", () => {
    renderTab();

    expect(
      screen.getByRole("button", { name: /Submit for Review.*Coming Soon/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/not determine publication readiness/i),
    ).toBeVisible();
  });

  it.each(["pending_review", "published", "rejected"] as const)(
    "does not offer a submission action for %s courses",
    (status) => {
      renderTab({ ...course, status });

      expect(
        screen.queryByRole("button", { name: /Submit for Review/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("distinguishes unchecked topic content and requests it only when expanded", async () => {
    const user = userEvent.setup();
    renderTab();

    expect(
      screen.getByText(
        "1 topics recorded. Expand a topic to check its lessons and quizzes.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Content unchecked")).toBeVisible();
    expect(mockedLessons).not.toHaveBeenCalled();
    expect(mockedQuizzes).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: /Topic 1: Linear equations\. Content unchecked/i,
      }),
    );

    expect(mockedLessons).toHaveBeenCalledWith(course.id, topic.id);
    expect(mockedQuizzes).toHaveBeenCalledWith(course.id, topic.id);
    expect(await screen.findByText("2 lessons recorded.")).toBeVisible();
    expect(screen.getByText("1 quiz recorded.")).toBeVisible();
  });

  it("shows an empty topics state without implying readiness", () => {
    mockedTopics.mockReturnValue(query({ items: [] }));
    renderTab();

    expect(screen.getByText("No topics are currently recorded.")).toBeVisible();
    expect(screen.getByText(/Final submission eligibility/i)).toBeVisible();
    expect(mockedLessons).not.toHaveBeenCalled();
    expect(mockedQuizzes).not.toHaveBeenCalled();
  });

  it("distinguishes unavailable topic data and provides a retry", async () => {
    const refetch = vi.fn();
    mockedTopics.mockReturnValue(
      query(undefined, {
        isError: true,
        isSuccess: false,
        refetch,
      }),
    );
    const user = userEvent.setup();
    renderTab();

    expect(
      screen.getByText("Topic information could not be checked."),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Try checking topics again" }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("distinguishes unavailable lesson data after a topic is expanded", async () => {
    mockedLessons.mockReturnValue(
      query(undefined, {
        isError: true,
        isSuccess: false,
      }),
    );
    const user = userEvent.setup();
    renderTab();

    await user.click(
      screen.getByRole("button", {
        name: /Topic 1: Linear equations\. Content unchecked/i,
      }),
    );

    expect(
      await screen.findByText("Lessons information could not be checked."),
    ).toBeVisible();
    expect(screen.getByText("1 quiz recorded.")).toBeVisible();
  });

  it("shows the disabled action label and accessible disclosure semantics", async () => {
    const user = userEvent.setup();
    renderTab();

    const disclosure = screen.getByRole("button", {
      name: /Topic 1: Linear equations\. Content unchecked/i,
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    await user.click(disclosure);
    expect(
      screen.getByRole("button", {
        name: /Topic 1: Linear equations\. Hide content check/i,
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
