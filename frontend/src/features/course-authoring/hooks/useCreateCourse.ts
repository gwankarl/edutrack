import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTeacherCourseRequest } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { teacherDashboardSummaryQueryKeys } from "../../teachers/hooks/teacher-dashboard-query-keys.js";
import { createTeacherCourse } from "../api/courses.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  teacherCourseQueryKeys,
} from "./useTeacherCourses.js";

export function useCreateCourse() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: (input: CreateTeacherCourseRequest) => {
      requireTeacherId(currentUser);
      return createTeacherCourse(input);
    },
    onSuccess: async (course) => {
      if (!userId) {
        return;
      }

      queryClient.setQueryData(
        teacherCourseQueryKeys.detail(userId, course.id),
        course,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: teacherCourseQueryKeys.lists(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: teacherDashboardSummaryQueryKeys.forUser(userId),
        }),
      ]);
    },
  });
}
