import { useQuery } from "@tanstack/react-query";
import { teacherCourseTopicParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { getTeacherTopic } from "../api/topics.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
} from "./useTeacherCourses.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

export function useTopic(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const parsedParams = teacherCourseTopicParamsSchema.safeParse({
    courseId,
    topicId,
  });
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;
  const validCourseId = parsedParams.success
    ? parsedParams.data.courseId
    : null;
  const validTopicId = parsedParams.success ? parsedParams.data.topicId : null;

  const query = useQuery({
    queryKey: courseContentQueryKeys.topic(
      userId,
      validCourseId,
      validTopicId,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      if (!parsedParams.success) throw parsedParams.error;
      return getTeacherTopic(
        parsedParams.data.courseId,
        parsedParams.data.topicId,
      );
    },
    enabled:
      userId !== null && validCourseId !== null && validTopicId !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsedParams.success ? null : parsedParams.error,
  };
}
