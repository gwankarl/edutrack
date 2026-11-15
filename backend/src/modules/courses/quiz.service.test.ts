import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherCourseResponse,
  TeacherQuizResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  CreateQuizResult,
  ReorderQuizzesResult,
  UpdateQuizResult,
} from "./quiz.repository.js";
import {
  createQuizService,
  QuizPositionConflictError,
  QuizOrderValidationError,
  QuizServiceValidationError,
  TeacherQuizNotFoundError,
} from "./quiz.service.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const courseId = "550e8400-e29b-41d4-a716-446655440002";
const topicId = "550e8400-e29b-41d4-a716-446655440003";
const quizId = "550e8400-e29b-41d4-a716-446655440004";

const course: TeacherCourseResponse = {
  id: courseId,
  title: "Introduction to Algebra",
  description: null,
  academicLevel: {
    id: "550e8400-e29b-41d4-a716-446655440005",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: "550e8400-e29b-41d4-a716-446655440006",
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft",
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const topic: TeacherTopicResponse = {
  id: topicId,
  courseId,
  title: "Number Systems",
  description: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const quiz: TeacherQuizResponse = {
  id: quizId,
  topicId,
  title: "Number Systems Quiz",
  description: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

function makeService() {
  const quizRepository = {
    createQuiz: vi.fn(async (): Promise<CreateQuizResult> => ({
      kind: "created",
      quiz,
    })),
    listTopicQuizzes: vi.fn(async (): Promise<TeacherQuizResponse[]> => [quiz]),
    getQuizById: vi.fn(async (): Promise<TeacherQuizResponse | null> => quiz),
    updateQuiz: vi.fn(async (): Promise<UpdateQuizResult> => ({
      kind: "updated",
      quiz,
    })),
    reorderTopicQuizzes: vi.fn(async (): Promise<ReorderQuizzesResult> => ({
      kind: "reordered",
      quizzes: [quiz],
    })),
  };

  const courseRepository = {
    getTeacherCourseById: vi.fn(
      async (): Promise<TeacherCourseResponse | null> => course,
    ),
  };

  const topicRepository = {
    getTopicById: vi.fn(
      async (): Promise<TeacherTopicResponse | null> => topic,
    ),
  };

  const teacherProfileRepository = {
    findByUserId: vi.fn(async (): Promise<{ id: string } | null> => ({
      id: teacherId,
    })),
  };

  const identityRepository = {
    findRolesByUserId: vi.fn(async (): Promise<UserRole[]> => [
      "student",
      "teacher",
    ]),
  };

  const service = createQuizService({
    quizRepository,
    courseRepository,
    topicRepository,
    teacherProfileRepository,
    identityRepository,
  });

  return {
    service,
    quizRepository,
    courseRepository,
    topicRepository,
    teacherProfileRepository,
    identityRepository,
  };
}

describe("quiz service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a quiz for the authenticated Teacher profile", async () => {
    const { service, courseRepository, topicRepository, quizRepository } =
      makeService();

    await expect(
      service.createQuiz(userId, courseId, topicId, {
        title: "  Number Systems Quiz  ",
      }),
    ).resolves.toEqual(quiz);

    expect(courseRepository.getTeacherCourseById).toHaveBeenCalledWith(
      courseId,
      teacherId,
    );
    expect(topicRepository.getTopicById).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
    );
    expect(quizRepository.createQuiz).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      { title: "Number Systems Quiz" },
    );
  });

  it("reorders all quizzes through the owner-checked Draft path", async () => {
    const { service, quizRepository, courseRepository, topicRepository } =
      makeService();
    await expect(
      service.reorderQuizzes(userId, courseId, topicId, { quizIds: [quizId] }),
    ).resolves.toEqual({ items: [quiz] });
    expect(courseRepository.getTeacherCourseById).toHaveBeenCalledWith(
      courseId,
      teacherId,
    );
    expect(topicRepository.getTopicById).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
    );
    expect(quizRepository.reorderTopicQuizzes).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      [quizId],
    );
  });

  it("rejects invalid or incomplete quiz orders and maps conflicts", async () => {
    const { service, quizRepository } = makeService();
    await expect(
      service.reorderQuizzes(userId, courseId, topicId, { quizIds: ["bad"] }),
    ).rejects.toBeInstanceOf(QuizServiceValidationError);
    quizRepository.reorderTopicQuizzes.mockResolvedValue({
      kind: "invalid_order",
    });
    await expect(
      service.reorderQuizzes(userId, courseId, topicId, { quizIds: [] }),
    ).rejects.toBeInstanceOf(QuizOrderValidationError);
    quizRepository.reorderTopicQuizzes.mockResolvedValue({ kind: "conflict" });
    await expect(
      service.reorderQuizzes(userId, courseId, topicId, { quizIds: [quizId] }),
    ).rejects.toBeInstanceOf(QuizPositionConflictError);
  });

  it("supports optional descriptions and incomplete Draft quizzes", async () => {
    const { service, quizRepository } = makeService();

    await service.createQuiz(userId, courseId, topicId, {
      title: "Draft quiz",
      description: "  Optional description  ",
    });

    expect(quizRepository.createQuiz).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      { title: "Draft quiz", description: "Optional description" },
    );
  });

  it("rejects invalid UUIDs and invalid data before repository writes", async () => {
    const { service, quizRepository, courseRepository } = makeService();

    await expect(
      service.createQuiz(userId, "invalid-course", topicId, {
        title: "Quiz",
      }),
    ).rejects.toBeInstanceOf(QuizServiceValidationError);

    await expect(
      service.createQuiz(userId, courseId, topicId, { title: " " }),
    ).rejects.toBeInstanceOf(QuizServiceValidationError);

    expect(courseRepository.getTeacherCourseById).not.toHaveBeenCalled();
    expect(quizRepository.createQuiz).not.toHaveBeenCalled();
  });

  it("rejects users without the Teacher role or approved Teacher profile", async () => {
    const withoutRole = makeService();
    withoutRole.identityRepository.findRolesByUserId.mockResolvedValue([
      "student",
    ]);

    await expect(
      withoutRole.service.createQuiz(userId, courseId, topicId, {
        title: "Quiz",
      }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);
    expect(withoutRole.quizRepository.createQuiz).not.toHaveBeenCalled();

    const withoutProfile = makeService();
    withoutProfile.teacherProfileRepository.findByUserId.mockResolvedValue(
      null,
    );

    await expect(
      withoutProfile.service.createQuiz(userId, courseId, topicId, {
        title: "Quiz",
      }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);
    expect(withoutProfile.quizRepository.createQuiz).not.toHaveBeenCalled();
  });

  it("rejects missing or non-owned courses before repository access", async () => {
    const { service, courseRepository, quizRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue(null);

    await expect(
      service.listTopicQuizzes(userId, courseId, topicId),
    ).rejects.toBeInstanceOf(TeacherCourseNotFoundError);

    expect(quizRepository.listTopicQuizzes).not.toHaveBeenCalled();
  });

  it("rejects a topic that does not belong to the owned course", async () => {
    const { service, topicRepository, quizRepository } = makeService();
    topicRepository.getTopicById.mockResolvedValue(null);

    await expect(
      service.listTopicQuizzes(userId, courseId, topicId),
    ).rejects.toBeInstanceOf(TeacherTopicNotFoundError);

    expect(quizRepository.listTopicQuizzes).not.toHaveBeenCalled();
  });

  it("lists quizzes using repository order and handles an empty result", async () => {
    const { service, quizRepository } = makeService();

    await expect(
      service.listTopicQuizzes(userId, courseId, topicId),
    ).resolves.toEqual({ items: [quiz] });

    quizRepository.listTopicQuizzes.mockResolvedValue([]);

    await expect(
      service.listTopicQuizzes(userId, courseId, topicId),
    ).resolves.toEqual({ items: [] });
  });

  it("retrieves a quiz using all parent IDs and the Teacher profile", async () => {
    const { service, quizRepository } = makeService();

    await expect(
      service.getQuiz(userId, courseId, topicId, quizId),
    ).resolves.toEqual(quiz);

    expect(quizRepository.getQuizById).toHaveBeenCalledWith(
      courseId,
      topicId,
      quizId,
      teacherId,
    );
  });

  it("returns not found for a missing or inaccessible quiz", async () => {
    const { service, quizRepository } = makeService();
    quizRepository.getQuizById.mockResolvedValue(null);

    await expect(
      service.getQuiz(userId, courseId, topicId, quizId),
    ).rejects.toBeInstanceOf(TeacherQuizNotFoundError);
  });

  it("updates an owned Draft quiz with validated fields", async () => {
    const { service, quizRepository } = makeService();

    await expect(
      service.updateQuiz(userId, courseId, topicId, quizId, {
        title: "  Updated quiz  ",
        description: null,
      }),
    ).resolves.toEqual(quiz);

    expect(quizRepository.updateQuiz).toHaveBeenCalledWith(
      courseId,
      topicId,
      quizId,
      teacherId,
      { title: "Updated quiz", description: null },
    );
  });

  it("rejects empty updates before repository access", async () => {
    const { service, quizRepository } = makeService();

    await expect(
      service.updateQuiz(userId, courseId, topicId, quizId, {}),
    ).rejects.toBeInstanceOf(QuizServiceValidationError);

    expect(quizRepository.updateQuiz).not.toHaveBeenCalled();
  });

  it("rejects create and update when the course is not Draft", async () => {
    const { service, courseRepository, quizRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue({
      ...course,
      status: "pending_review",
    });

    await expect(
      service.createQuiz(userId, courseId, topicId, { title: "Quiz" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    await expect(
      service.updateQuiz(userId, courseId, topicId, quizId, {
        title: "Updated",
      }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    expect(quizRepository.createQuiz).not.toHaveBeenCalled();
    expect(quizRepository.updateQuiz).not.toHaveBeenCalled();
  });

  it("maps repository Draft and position conflicts to typed errors", async () => {
    const { service, quizRepository } = makeService();
    quizRepository.createQuiz.mockResolvedValue({ kind: "conflict" });

    await expect(
      service.createQuiz(userId, courseId, topicId, { title: "Quiz" }),
    ).rejects.toBeInstanceOf(QuizPositionConflictError);

    quizRepository.updateQuiz.mockResolvedValue({ kind: "not_editable" });

    await expect(
      service.updateQuiz(userId, courseId, topicId, quizId, {
        title: "Updated",
      }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);
  });

  it("maps concurrent missing parent results safely", async () => {
    const { service, quizRepository } = makeService();
    quizRepository.createQuiz.mockResolvedValue({ kind: "not_found" });

    await expect(
      service.createQuiz(userId, courseId, topicId, { title: "Quiz" }),
    ).rejects.toBeInstanceOf(TeacherTopicNotFoundError);
  });

  it("validates route UUIDs before repository operations", async () => {
    const { service, quizRepository } = makeService();

    await expect(
      service.getQuiz(userId, courseId, topicId, "invalid-id"),
    ).rejects.toBeInstanceOf(QuizServiceValidationError);

    expect(quizRepository.getQuizById).not.toHaveBeenCalled();
  });
});
