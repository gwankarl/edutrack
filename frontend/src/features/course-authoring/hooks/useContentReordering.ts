import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ReorderTeacherLessonsRequest,
  ReorderTeacherTopicsRequest,
} from "@edutrack/contracts";
import {
  teacherCourseParamsSchema,
  teacherTopicLessonCollectionParamsSchema,
} from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { reorderTeacherTopics } from "../api/topics.api.js";
import { reorderTeacherLessons as reorderLessons } from "../api/lessons.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
} from "./useTeacherCourses.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

export function useReorderCourseTopics(courseId: string | null | undefined) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedCourse = teacherCourseParamsSchema.safeParse({ courseId });
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: (input: ReorderTeacherTopicsRequest) => {
      requireTeacherId(currentUser);
      if (!parsedCourse.success) throw parsedCourse.error;
      return reorderTeacherTopics(parsedCourse.data.courseId, input);
    },
    onSuccess: async (topicList) => {
      if (!userId || !parsedCourse.success) return;

      queryClient.setQueryData(
        courseContentQueryKeys.topicList(userId, parsedCourse.data.courseId),
        topicList,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.topicDetails(
          userId,
          parsedCourse.data.courseId,
        ),
      });
    },
    onError: async () => {
      if (!userId || !parsedCourse.success) return;

      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.topicList(
          userId,
          parsedCourse.data.courseId,
        ),
      });
    },
  });
}

export function useReorderTopicLessons(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedParams = teacherTopicLessonCollectionParamsSchema.safeParse({
    courseId,
    topicId,
  });
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: (input: ReorderTeacherLessonsRequest) => {
      requireTeacherId(currentUser);
      if (!parsedParams.success) throw parsedParams.error;
      return reorderLessons(
        parsedParams.data.courseId,
        parsedParams.data.topicId,
        input,
      );
    },
    onSuccess: async (lessonList) => {
      if (!userId || !parsedParams.success) return;

      queryClient.setQueryData(
        courseContentQueryKeys.lessonList(
          userId,
          parsedParams.data.courseId,
          parsedParams.data.topicId,
        ),
        lessonList,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.lessonDetails(
          userId,
          parsedParams.data.courseId,
          parsedParams.data.topicId,
        ),
      });
    },
    onError: async () => {
      if (!userId || !parsedParams.success) return;

      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.lessonList(
          userId,
          parsedParams.data.courseId,
          parsedParams.data.topicId,
        ),
      });
    },
  });
}
