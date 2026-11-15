import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherCourseResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  CreateTopicResult,
  ReorderTopicsResult,
  UpdateTopicResult,
} from "./topic.repository.js";
import {
  createTopicService,
  TopicPositionConflictError,
  TopicServiceValidationError,
  TeacherTopicNotFoundError,
} from "./topic.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const courseId = "550e8400-e29b-41d4-a716-446655440002";
const topicId = "550e8400-e29b-41d4-a716-446655440003";

const course: TeacherCourseResponse = {
  id: courseId,
  title: "Introduction to Algebra",
  description: null,
  academicLevel: {
    id: "550e8400-e29b-41d4-a716-446655440004",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: "550e8400-e29b-41d4-a716-446655440005",
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

function makeService() {
  const topicRepository = {
    createTopic: vi.fn(async (): Promise<CreateTopicResult> => ({
      kind: "created",
      topic,
    })),
    listCourseTopics: vi.fn(async (): Promise<TeacherTopicResponse[]> => [
      topic,
    ]),
    getTopicById: vi.fn(
      async (): Promise<TeacherTopicResponse | null> => topic,
    ),
    updateTopic: vi.fn(async (): Promise<UpdateTopicResult> => ({
      kind: "updated",
      topic,
    })),
    reorderCourseTopics: vi.fn(async (): Promise<ReorderTopicsResult> => ({
      kind: "reordered",
      topics: [topic],
    })),
  };

  const courseRepository = {
    getTeacherCourseById: vi.fn(
      async (): Promise<TeacherCourseResponse | null> => course,
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

  const service = createTopicService({
    topicRepository,
    courseRepository,
    teacherProfileRepository,
    identityRepository,
  });

  return {
    service,
    topicRepository,
    courseRepository,
    teacherProfileRepository,
    identityRepository,
  };
}

describe("topic service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a topic for the authenticated Teacher profile", async () => {
    const { service, topicRepository, courseRepository } = makeService();

    await expect(
      service.createTopic(userId, courseId, {
        title: "  Number Systems  ",
      }),
    ).resolves.toEqual(topic);

    expect(courseRepository.getTeacherCourseById).toHaveBeenCalledWith(
      courseId,
      teacherId,
    );
    expect(topicRepository.createTopic).toHaveBeenCalledWith(
      courseId,
      teacherId,
      { title: "Number Systems" },
    );
  });

  it("rejects invalid UUIDs and invalid request data before repository writes", async () => {
    const { service, topicRepository, courseRepository } = makeService();

    await expect(
      service.createTopic(userId, "not-a-uuid", { title: "Topic" }),
    ).rejects.toBeInstanceOf(TopicServiceValidationError);

    await expect(
      service.createTopic(userId, courseId, { title: "   " }),
    ).rejects.toBeInstanceOf(TopicServiceValidationError);

    expect(courseRepository.getTeacherCourseById).not.toHaveBeenCalled();
    expect(topicRepository.createTopic).not.toHaveBeenCalled();
  });

  it("rejects users without the Teacher role", async () => {
    const { service, identityRepository, topicRepository } = makeService();
    identityRepository.findRolesByUserId.mockResolvedValue(["student"]);

    await expect(
      service.createTopic(userId, courseId, { title: "Topic" }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(topicRepository.createTopic).not.toHaveBeenCalled();
  });

  it("rejects users without an approved Teacher profile", async () => {
    const { service, teacherProfileRepository, topicRepository } =
      makeService();
    teacherProfileRepository.findByUserId.mockResolvedValue(null);

    await expect(
      service.createTopic(userId, courseId, { title: "Topic" }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(topicRepository.createTopic).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-owned course before listing topics", async () => {
    const { service, courseRepository, topicRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue(null);

    await expect(
      service.listCourseTopics(userId, courseId),
    ).rejects.toBeInstanceOf(TeacherCourseNotFoundError);

    expect(topicRepository.listCourseTopics).not.toHaveBeenCalled();
  });

  it("lists topics through the repository and validates the response", async () => {
    const { service, topicRepository } = makeService();

    await expect(service.listCourseTopics(userId, courseId)).resolves.toEqual({
      items: [topic],
    });

    expect(topicRepository.listCourseTopics).toHaveBeenCalledWith(
      courseId,
      teacherId,
    );
  });

  it("returns an empty list for an owned course with no topics", async () => {
    const { service, topicRepository } = makeService();
    topicRepository.listCourseTopics.mockResolvedValue([]);

    await expect(service.listCourseTopics(userId, courseId)).resolves.toEqual({
      items: [],
    });
  });

  it("retrieves a topic through the owner-scoped repository method", async () => {
    const { service, topicRepository } = makeService();

    await expect(service.getTopic(userId, courseId, topicId)).resolves.toEqual(
      topic,
    );

    expect(topicRepository.getTopicById).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
    );
  });

  it("returns not found when the topic is absent from the owned course", async () => {
    const { service, topicRepository } = makeService();
    topicRepository.getTopicById.mockResolvedValue(null);

    await expect(
      service.getTopic(userId, courseId, topicId),
    ).rejects.toBeInstanceOf(TeacherTopicNotFoundError);
  });

  it("updates an owned Draft topic with validated fields", async () => {
    const { service, topicRepository } = makeService();

    await expect(
      service.updateTopic(userId, courseId, topicId, {
        title: "  Updated title  ",
      }),
    ).resolves.toEqual(topic);

    expect(topicRepository.updateTopic).toHaveBeenCalledWith(
      courseId,
      topicId,
      teacherId,
      { title: "Updated title" },
    );
  });

  it("maps a Draft-status conflict to the existing typed course error", async () => {
    const { service, topicRepository } = makeService();
    topicRepository.updateTopic.mockResolvedValue({ kind: "not_editable" });

    await expect(
      service.updateTopic(userId, courseId, topicId, { title: "Updated" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);
  });

  it("maps concurrent topic creation conflicts to a typed error", async () => {
    const { service, topicRepository } = makeService();
    topicRepository.createTopic.mockResolvedValue({ kind: "conflict" });

    await expect(
      service.createTopic(userId, courseId, { title: "Topic" }),
    ).rejects.toBeInstanceOf(TopicPositionConflictError);
  });

  it("rejects empty update input before calling the repository", async () => {
    const { service, topicRepository } = makeService();

    await expect(
      service.updateTopic(userId, courseId, topicId, {}),
    ).rejects.toBeInstanceOf(TopicServiceValidationError);

    expect(topicRepository.updateTopic).not.toHaveBeenCalled();
  });

  it("reorders the complete topic list through the owned-course repository", async () => {
    const { service, topicRepository } = makeService();

    await expect(
      service.reorderTopics(userId, courseId, { topicIds: [topicId] }),
    ).resolves.toEqual({ items: [topic] });
    expect(topicRepository.reorderCourseTopics).toHaveBeenCalledWith(
      courseId,
      teacherId,
      [topicId],
    );
  });

  it("rejects duplicate IDs and maps incomplete orders to validation errors", async () => {
    const { service, topicRepository } = makeService();

    await expect(
      service.reorderTopics(userId, courseId, { topicIds: [topicId, topicId] }),
    ).rejects.toBeInstanceOf(TopicServiceValidationError);
    topicRepository.reorderCourseTopics.mockResolvedValue({
      kind: "invalid_order",
    });
    await expect(
      service.reorderTopics(userId, courseId, { topicIds: [] }),
    ).rejects.toThrow("every topic in this course exactly once");
  });
});
