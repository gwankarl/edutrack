import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTeacherLessonRequest,
  UpdateTeacherLessonRequest,
} from "@edutrack/contracts";
import {
  teacherCourseTopicLessonParamsSchema,
  teacherTopicLessonCollectionParamsSchema,
} from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import {
  createTeacherLesson,
  updateTeacherLesson,
} from "../api/lessons.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
} from "./useTeacherCourses.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

export function useCreateLesson(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedParams = teacherTopicLessonCollectionParamsSchema.safeParse({
    courseId,
    topicId,
  });
  const validParams = parsedParams.success ? parsedParams.data : null;
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: (input: CreateTeacherLessonRequest) => {
      requireTeacherId(currentUser);
      if (!validParams) throw parsedParams.error;
      return createTeacherLesson(
        validParams.courseId,
        validParams.topicId,
        input,
      );
    },
    onSuccess: async (lesson) => {
      if (!userId || !validParams) return;

      queryClient.setQueryData(
        courseContentQueryKeys.lesson(
          userId,
          validParams.courseId,
          validParams.topicId,
          lesson.id,
        ),
        lesson,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.lessonList(
          userId,
          validParams.courseId,
          validParams.topicId,
        ),
      });
    },
  });
}

export interface UpdateLessonVariables {
  input: UpdateTeacherLessonRequest;
}

export function useUpdateLesson(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  lessonId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedParams = teacherCourseTopicLessonParamsSchema.safeParse({
    courseId,
    topicId,
    lessonId,
  });
  const validParams = parsedParams.success ? parsedParams.data : null;
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: ({ input }: UpdateLessonVariables) => {
      requireTeacherId(currentUser);
      if (!validParams) throw parsedParams.error;
      return updateTeacherLesson(
        validParams.courseId,
        validParams.topicId,
        validParams.lessonId,
        input,
      );
    },
    onSuccess: async (lesson) => {
      if (!userId || !validParams) return;

      queryClient.setQueryData(
        courseContentQueryKeys.lesson(
          userId,
          validParams.courseId,
          validParams.topicId,
          lesson.id,
        ),
        lesson,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.lessonList(
          userId,
          validParams.courseId,
          validParams.topicId,
        ),
      });
    },
  });
}
