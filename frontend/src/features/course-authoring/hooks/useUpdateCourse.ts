import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateTeacherCourseRequest } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { updateTeacherCourse } from "../api/courses.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  teacherCourseQueryKeys,
} from "./useTeacherCourses.js";

export interface UpdateTeacherCourseVariables {
  courseId: string;
  input: UpdateTeacherCourseRequest;
}

export function useUpdateCourse() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: ({ courseId, input }: UpdateTeacherCourseVariables) => {
      requireTeacherId(currentUser);
      return updateTeacherCourse(courseId, input);
    },
    onSuccess: async (course) => {
      if (!userId) {
        return;
      }

      queryClient.setQueryData(
        teacherCourseQueryKeys.detail(userId, course.id),
        course,
      );
      await queryClient.invalidateQueries({
        queryKey: teacherCourseQueryKeys.lists(userId),
      });
    },
  });
}
