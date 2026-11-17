import { useQuery } from "@tanstack/react-query";
import { teacherCourseListQuerySchema } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import {
  listTeacherCourses,
  type TeacherCourseListFilters,
} from "../api/courses.api.js";

export const teacherCourseQueryKeys = {
  all: ["course-authoring", "courses"] as const,
  lists: (userId: string | null) =>
    ["course-authoring", "courses", userId, "list"] as const,
  list: (userId: string | null, filters: TeacherCourseListFilters) =>
    ["course-authoring", "courses", userId, "list", filters] as const,
  details: (userId: string | null) =>
    ["course-authoring", "courses", userId, "detail"] as const,
  detail: (userId: string | null, courseId: string | null) =>
    ["course-authoring", "courses", userId, "detail", courseId] as const,
};

export type TeacherAccessStatus =
  "loading" | "unauthenticated" | "error" | "forbidden" | "authorized";

type CurrentUserState = ReturnType<typeof useCurrentUser>;

export function getTeacherAccessStatus(
  currentUser: CurrentUserState,
): TeacherAccessStatus {
  if (currentUser.status !== "authenticated") {
    return currentUser.status;
  }

  return currentUser.user.accountStatus === "active" &&
    currentUser.user.roles.includes("teacher")
    ? "authorized"
    : "forbidden";
}

export function requireTeacherId(currentUser: CurrentUserState): string {
  if (currentUser.status !== "authenticated") {
    throw new ApiError({
      status: 401,
      title: "Authentication required",
      detail: "Sign in with an active Teacher account to manage courses.",
    });
  }

  if (
    currentUser.user.accountStatus !== "active" ||
    !currentUser.user.roles.includes("teacher")
  ) {
    throw new ApiError({
      status: 403,
      title: "Teacher access required",
      detail: "An active Teacher account is required to manage courses.",
    });
  }

  return currentUser.user.id;
}

export function shouldRetryCourseQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (
    error instanceof ApiError &&
    error.status !== null &&
    error.status < 500
  ) {
    return false;
  }

  return failureCount < 1;
}

export function useTeacherCourses(filters: TeacherCourseListFilters = {}) {
  const currentUser = useCurrentUser();
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;
  const parsedFilters = teacherCourseListQuerySchema.parse(filters);

  const query = useQuery({
    queryKey: teacherCourseQueryKeys.list(userId, parsedFilters),
    queryFn: () => {
      requireTeacherId(currentUser);
      return listTeacherCourses(parsedFilters);
    },
    enabled: userId !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
  };
}
