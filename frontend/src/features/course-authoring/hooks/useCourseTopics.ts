import { useQuery } from "@tanstack/react-query";
import { teacherCourseParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { listTeacherTopics } from "../api/topics.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
} from "./useTeacherCourses.js";

export const courseContentQueryKeys = {
  root: (userId: string | null) =>
    ["course-authoring", "courses", userId, "content"] as const,
  topics: (userId: string | null, courseId: string | null) =>
    [...courseContentQueryKeys.root(userId), courseId, "topics"] as const,
  topicList: (userId: string | null, courseId: string | null) =>
    [...courseContentQueryKeys.topics(userId, courseId), "list"] as const,
  topicDetails: (userId: string | null, courseId: string | null) =>
    [...courseContentQueryKeys.topics(userId, courseId), "detail"] as const,
  topic: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...courseContentQueryKeys.topicDetails(userId, courseId),
      topicId,
    ] as const,
  lessons: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...courseContentQueryKeys.topics(userId, courseId),
      topicId,
      "lessons",
    ] as const,
  lessonList: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...courseContentQueryKeys.lessons(userId, courseId, topicId),
      "list",
    ] as const,
  lessonDetails: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...courseContentQueryKeys.lessons(userId, courseId, topicId),
      "detail",
    ] as const,
  lesson: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    lessonId: string | null,
  ) =>
    [
      ...courseContentQueryKeys.lessonDetails(userId, courseId, topicId),
      lessonId,
    ] as const,
};

export function useCourseTopics(courseId: string | null | undefined) {
  const currentUser = useCurrentUser();
  const parsedParams = teacherCourseParamsSchema.safeParse({ courseId });
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;
  const validCourseId = parsedParams.success
    ? parsedParams.data.courseId
    : null;

  const query = useQuery({
    queryKey: courseContentQueryKeys.topicList(userId, validCourseId),
    queryFn: () => {
      requireTeacherId(currentUser);
      if (!parsedParams.success) throw parsedParams.error;
      return listTeacherTopics(parsedParams.data.courseId);
    },
    enabled: userId !== null && validCourseId !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsedParams.success ? null : parsedParams.error,
  };
}
