import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTeacherTopicRequest,
  UpdateTeacherTopicRequest,
} from "@edutrack/contracts";
import { teacherCourseParamsSchema, teacherCourseTopicParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import {
  createTeacherTopic,
  updateTeacherTopic,
} from "../api/topics.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
} from "./useTeacherCourses.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

export function useCreateTopic(courseId: string | null | undefined) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedCourse = teacherCourseParamsSchema.safeParse({ courseId });
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: (input: CreateTeacherTopicRequest) => {
      requireTeacherId(currentUser);
      if (!parsedCourse.success) throw parsedCourse.error;
      return createTeacherTopic(parsedCourse.data.courseId, input);
    },
    onSuccess: async (topic) => {
      if (!userId) return;

      queryClient.setQueryData(
        courseContentQueryKeys.topic(userId, topic.courseId, topic.id),
        topic,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.topicList(userId, topic.courseId),
      });
    },
  });
}

export interface UpdateTopicVariables {
  input: UpdateTeacherTopicRequest;
}

export function useUpdateTopic(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const parsedParams = teacherCourseTopicParamsSchema.safeParse({
    courseId,
    topicId,
  });
  const userId =
    getTeacherAccessStatus(currentUser) === "authorized"
      ? requireTeacherId(currentUser)
      : null;

  return useMutation({
    mutationFn: ({ input }: UpdateTopicVariables) => {
      requireTeacherId(currentUser);
      if (!parsedParams.success) throw parsedParams.error;
      return updateTeacherTopic(
        parsedParams.data.courseId,
        parsedParams.data.topicId,
        input,
      );
    },
    onSuccess: async (topic) => {
      if (!userId) return;

      queryClient.setQueryData(
        courseContentQueryKeys.topic(userId, topic.courseId, topic.id),
        topic,
      );
      await queryClient.invalidateQueries({
        queryKey: courseContentQueryKeys.topicList(userId, topic.courseId),
      });
    },
  });
}
