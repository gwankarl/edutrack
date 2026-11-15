import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherCourseResponse,
  TeacherLessonResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  CreateLessonResult,
  ReorderLessonsResult,
  UpdateLessonResult,
} from "./lesson.repository.js";
import {
  createLessonService,
  LessonPositionConflictError,
  LessonServiceValidationError,
  TeacherLessonNotFoundError,
} from "./lesson.service.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const courseId = "550e8400-e29b-41d4-a716-446655440002";
const topicId = "550e8400-e29b-41d4-a716-446655440003";
const lessonId = "550e8400-e29b-41d4-a716-446655440004";

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

const lesson: TeacherLessonResponse = {
  id: lessonId,
  topicId,
  title: "Introduction",
  content: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

function makeService() {
  const lessonRepository = {
    createLesson: vi.fn(async (): Promise<CreateLessonResult> => ({
      kind: "created",
      lesson,
    })),
    listTopicLessons: vi.fn(async (): Promise<TeacherLessonResponse[]> => [
      lesson,
    ]),
    getLessonById: vi.fn(
      async (): Promise<TeacherLessonResponse | null> => lesson,
    ),
    updateLesson: vi.fn(async (): Promise<UpdateLessonResult> => ({
      kind: "updated",
      lesson,
    })),
    reorderTopicLessons: vi.fn(async (): Promise<ReorderLessonsResult> => ({
      kind: "reordered",
      lessons: [lesson],
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

  const service = createLessonService({
    lessonRepository,
    courseRepository,
    topicRepository,
    teacherProfileRepository,
    identityRepository,
  });

  return {
    service,
    lessonRepository,
    courseRepository,
    topicRepository,
    teacherProfileRepository,
    identityRepository,
  };
}

describe("lesson service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a lesson using the authenticated Teacher profile", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.createLesson(userId, courseId, topicId, {
        title: "  Introduction  ",
      }),
    ).resolves.toEqual(lesson);

    expect(lessonRepository.createLesson).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      { title: "Introduction" },
    );
  });

  it("allows incomplete lesson content while drafting", async () => {
    const { service, lessonRepository } = makeService();

    await service.createLesson(userId, courseId, topicId, {
      title: "Introduction",
    });

    expect(lessonRepository.createLesson).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      { title: "Introduction" },
    );
  });

  it("rejects invalid UUIDs and invalid input before repository writes", async () => {
    const { service, lessonRepository, courseRepository } = makeService();

    await expect(
      service.createLesson(userId, "invalid-course-id", topicId, {
        title: "Lesson",
      }),
    ).rejects.toBeInstanceOf(LessonServiceValidationError);

    await expect(
      service.createLesson(userId, courseId, topicId, { title: " " }),
    ).rejects.toBeInstanceOf(LessonServiceValidationError);

    expect(courseRepository.getTeacherCourseById).not.toHaveBeenCalled();
    expect(lessonRepository.createLesson).not.toHaveBeenCalled();
  });

  it("rejects a user without the Teacher role", async () => {
    const { service, identityRepository, lessonRepository } = makeService();
    identityRepository.findRolesByUserId.mockResolvedValue(["student"]);

    await expect(
      service.createLesson(userId, courseId, topicId, { title: "Lesson" }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(lessonRepository.createLesson).not.toHaveBeenCalled();
  });

  it("rejects a user without a Teacher profile", async () => {
    const { service, teacherProfileRepository, lessonRepository } =
      makeService();
    teacherProfileRepository.findByUserId.mockResolvedValue(null);

    await expect(
      service.createLesson(userId, courseId, topicId, { title: "Lesson" }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(lessonRepository.createLesson).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-owned course", async () => {
    const { service, courseRepository, lessonRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue(null);

    await expect(
      service.listTopicLessons(userId, courseId, topicId),
    ).rejects.toBeInstanceOf(TeacherCourseNotFoundError);

    expect(lessonRepository.listTopicLessons).not.toHaveBeenCalled();
  });

  it("rejects a topic that does not belong to the owned course", async () => {
    const { service, topicRepository, lessonRepository } = makeService();
    topicRepository.getTopicById.mockResolvedValue(null);

    await expect(
      service.listTopicLessons(userId, courseId, topicId),
    ).rejects.toBeInstanceOf(TeacherTopicNotFoundError);

    expect(lessonRepository.listTopicLessons).not.toHaveBeenCalled();
  });

  it("lists lessons in repository order and supports an empty result", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.listTopicLessons(userId, courseId, topicId),
    ).resolves.toEqual({ items: [lesson] });

    lessonRepository.listTopicLessons.mockResolvedValue([]);

    await expect(
      service.listTopicLessons(userId, courseId, topicId),
    ).resolves.toEqual({ items: [] });
  });

  it("retrieves an owned lesson using all parent IDs and the Teacher profile", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.getLesson(userId, courseId, topicId, lessonId),
    ).resolves.toEqual(lesson);

    expect(lessonRepository.getLessonById).toHaveBeenCalledWith(
      courseId,
      topicId,
      lessonId,
      teacherId,
    );
  });

  it("returns a typed not-found error for a missing lesson", async () => {
    const { service, lessonRepository } = makeService();
    lessonRepository.getLessonById.mockResolvedValue(null);

    await expect(
      service.getLesson(userId, courseId, topicId, lessonId),
    ).rejects.toBeInstanceOf(TeacherLessonNotFoundError);
  });

  it("updates a Draft lesson with validated fields", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.updateLesson(userId, courseId, topicId, lessonId, {
        title: "  Updated lesson  ",
      }),
    ).resolves.toEqual(lesson);

    expect(lessonRepository.updateLesson).toHaveBeenCalledWith(
      courseId,
      topicId,
      lessonId,
      teacherId,
      { title: "Updated lesson" },
    );
  });

  it("allows clearing lesson content while the course remains Draft", async () => {
    const { service, lessonRepository } = makeService();

    await service.updateLesson(userId, courseId, topicId, lessonId, {
      content: null,
    });

    expect(lessonRepository.updateLesson).toHaveBeenCalledWith(
      courseId,
      topicId,
      lessonId,
      teacherId,
      { content: null },
    );
  });

  it("rejects lesson mutations when the course is not Draft", async () => {
    const { service, courseRepository, lessonRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue({
      ...course,
      status: "pending_review",
    });

    await expect(
      service.createLesson(userId, courseId, topicId, { title: "Lesson" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    await expect(
      service.updateLesson(userId, courseId, topicId, lessonId, {
        title: "Changed",
      }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    expect(lessonRepository.createLesson).not.toHaveBeenCalled();
    expect(lessonRepository.updateLesson).not.toHaveBeenCalled();
  });

  it("maps a concurrent Draft transition to the typed conflict error", async () => {
    const { service, lessonRepository } = makeService();
    lessonRepository.updateLesson.mockResolvedValue({ kind: "not_editable" });

    await expect(
      service.updateLesson(userId, courseId, topicId, lessonId, {
        title: "Changed",
      }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);
  });

  it("maps position conflicts to a typed error", async () => {
    const { service, lessonRepository } = makeService();
    lessonRepository.createLesson.mockResolvedValue({ kind: "conflict" });

    await expect(
      service.createLesson(userId, courseId, topicId, { title: "Lesson" }),
    ).rejects.toBeInstanceOf(LessonPositionConflictError);
  });

  it("rejects empty update input before calling the repository", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.updateLesson(userId, courseId, topicId, lessonId, {}),
    ).rejects.toBeInstanceOf(LessonServiceValidationError);

    expect(lessonRepository.updateLesson).not.toHaveBeenCalled();
  });

  it("reorders lessons within the owned course and topic", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.reorderLessons(userId, courseId, topicId, {
        lessonIds: [lessonId],
      }),
    ).resolves.toEqual({ items: [lesson] });
    expect(lessonRepository.reorderTopicLessons).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      [lessonId],
    );
  });

  it("rejects duplicate lesson IDs and maps incomplete orders to validation errors", async () => {
    const { service, lessonRepository } = makeService();

    await expect(
      service.reorderLessons(userId, courseId, topicId, {
        lessonIds: [lessonId, lessonId],
      }),
    ).rejects.toBeInstanceOf(LessonServiceValidationError);
    lessonRepository.reorderTopicLessons.mockResolvedValue({
      kind: "invalid_order",
    });
    await expect(
      service.reorderLessons(userId, courseId, topicId, { lessonIds: [] }),
    ).rejects.toThrow("every lesson in this topic exactly once");
  });
});
