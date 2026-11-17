import { useQuery } from "@tanstack/react-query";
import { teacherCourseTopicLessonParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { getTeacherLesson } from "../api/lessons.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
} from "./useTeacherCourses.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

export function useLesson(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  lessonId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const parsedParams = teacherCourseTopicLessonParamsSchema.safeParse({
    courseId,
    topicId,
    lessonId,
  });
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;
  const validCourseId = parsedParams.success
    ? parsedParams.data.courseId
    : null;
  const validTopicId = parsedParams.success ? parsedParams.data.topicId : null;
  const validLessonId = parsedParams.success
    ? parsedParams.data.lessonId
    : null;

  const query = useQuery({
    queryKey: courseContentQueryKeys.lesson(
      userId,
      validCourseId,
      validTopicId,
      validLessonId,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      if (!parsedParams.success) throw parsedParams.error;
      return getTeacherLesson(
        parsedParams.data.courseId,
        parsedParams.data.topicId,
        parsedParams.data.lessonId,
      );
    },
    enabled:
      userId !== null &&
      validCourseId !== null &&
      validTopicId !== null &&
      validLessonId !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsedParams.success ? null : parsedParams.error,
  };
}
