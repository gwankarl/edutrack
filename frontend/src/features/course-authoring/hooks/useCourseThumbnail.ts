import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CourseThumbnailResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import {
  removeTeacherCourseThumbnail,
  uploadTeacherCourseThumbnail,
} from "../api/courses.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  teacherCourseQueryKeys,
} from "./useTeacherCourses.js";

interface CourseThumbnailVariables {
  courseId: string;
}

interface UploadCourseThumbnailVariables extends CourseThumbnailVariables {
  file: File;
}

export function useUploadCourseThumbnail() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: ({ courseId, file }: UploadCourseThumbnailVariables) => {
      requireTeacherId(currentUser);
      return uploadTeacherCourseThumbnail(courseId, file);
    },
    onSuccess: async (thumbnail: CourseThumbnailResponse, { courseId }) => {
      if (!userId) return;

      queryClient.setQueryData<TeacherCourseResponse>(
        teacherCourseQueryKeys.detail(userId, courseId),
        (current) => (current ? { ...current, thumbnail } : current),
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: teacherCourseQueryKeys.detail(userId, courseId),
        }),
        queryClient.invalidateQueries({
          queryKey: teacherCourseQueryKeys.lists(userId),
        }),
      ]);
    },
  });
}

export function useRemoveCourseThumbnail() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: ({ courseId }: CourseThumbnailVariables) => {
      requireTeacherId(currentUser);
      return removeTeacherCourseThumbnail(courseId);
    },
    onSuccess: async (_result, { courseId }) => {
      if (!userId) return;

      queryClient.setQueryData<TeacherCourseResponse>(
        teacherCourseQueryKeys.detail(userId, courseId),
        (current) => (current ? { ...current, thumbnail: null } : current),
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: teacherCourseQueryKeys.detail(userId, courseId),
        }),
        queryClient.invalidateQueries({
          queryKey: teacherCourseQueryKeys.lists(userId),
        }),
      ]);
    },
  });
}
