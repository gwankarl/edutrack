import { useQuery } from "@tanstack/react-query";
import { teacherCourseParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { getTeacherCourse } from "../api/courses.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
  teacherCourseQueryKeys,
} from "./useTeacherCourses.js";

export function useTeacherCourse(courseId: string | null | undefined) {
  const currentUser = useCurrentUser();
  const parsedParams = teacherCourseParamsSchema.safeParse({ courseId });
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;
  const validCourseId = parsedParams.success
    ? parsedParams.data.courseId
    : null;

  const query = useQuery({
    queryKey: teacherCourseQueryKeys.detail(userId, validCourseId),
    queryFn: () => {
      requireTeacherId(currentUser);

      if (!parsedParams.success) {
        throw parsedParams.error;
      }

      return getTeacherCourse(parsedParams.data.courseId);
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
