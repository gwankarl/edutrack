import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../../../../lib/api/api-error.js";
import { useCurrentUser } from "../../../auth/hooks/useCurrentUser.js";
import {
  listAdminTeacherApplications,
  type AdminTeacherApplicationListFilters,
} from "../api/teacher-application-review.api.js";

export const adminTeacherApplicationQueryKeys = {
  all: ["admin", "teacher-applications"] as const,
  lists: (administratorId: string | null) =>
    ["admin", "teacher-applications", administratorId, "list"] as const,
  list: (
    administratorId: string | null,
    filters: AdminTeacherApplicationListFilters,
  ) =>
    [
      "admin",
      "teacher-applications",
      administratorId,
      "list",
      filters,
    ] as const,
  details: (administratorId: string | null) =>
    ["admin", "teacher-applications", administratorId, "detail"] as const,
  detail: (administratorId: string | null, applicationId: string | null) =>
    [
      "admin",
      "teacher-applications",
      administratorId,
      "detail",
      applicationId,
    ] as const,
};

export type AdministratorAccessStatus =
  "loading" | "unauthenticated" | "error" | "forbidden" | "authorized";

export function requireAdministratorId(
  currentUser: ReturnType<typeof useCurrentUser>,
): string {
  if (currentUser.status !== "authenticated") {
    throw new ApiError({
      status: 401,
      title: "Authentication required",
      detail: "Sign in with an Administrator account to review applications.",
    });
  }

  if (!currentUser.user.roles.includes("administrator")) {
    throw new ApiError({
      status: 403,
      title: "Administrator access required",
      detail: "You do not have permission to review applications.",
    });
  }

  return currentUser.user.id;
}

export function getAdministratorId(
  currentUser: ReturnType<typeof useCurrentUser>,
): string | null {
  if (
    currentUser.status === "authenticated" &&
    currentUser.user.roles.includes("administrator")
  ) {
    return currentUser.user.id;
  }

  return null;
}

export function getAdministratorAccessStatus(
  currentUser: ReturnType<typeof useCurrentUser>,
): AdministratorAccessStatus {
  if (currentUser.status !== "authenticated") {
    return currentUser.status;
  }

  return currentUser.user.roles.includes("administrator")
    ? "authorized"
    : "forbidden";
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status !== null &&
    error.status < 500
  ) {
    return false;
  }

  return failureCount < 1;
}

export function useTeacherApplications(
  filters: AdminTeacherApplicationListFilters = {},
) {
  const currentUser = useCurrentUser();
  const administratorId = getAdministratorId(currentUser);

  const query = useQuery({
    queryKey: adminTeacherApplicationQueryKeys.list(administratorId, filters),
    queryFn: () => {
      requireAdministratorId(currentUser);
      return listAdminTeacherApplications(filters);
    },
    enabled: administratorId !== null,
    retry: shouldRetry,
  });

  return {
    ...query,
    authorizationStatus: getAdministratorAccessStatus(currentUser),
  };
}
