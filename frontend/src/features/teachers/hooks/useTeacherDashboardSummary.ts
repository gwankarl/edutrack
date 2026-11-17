import { useQuery } from "@tanstack/react-query";

import { getTeacherDashboardSummary } from "../api/teacher-dashboard.api.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
} from "../../course-authoring/hooks/useTeacherCourses.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { teacherDashboardSummaryQueryKeys } from "./teacher-dashboard-query-keys.js";

export { teacherDashboardSummaryQueryKeys } from "./teacher-dashboard-query-keys.js";

export function useTeacherDashboardSummary() {
  const currentUser = useCurrentUser();
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;

  const query = useQuery({
    queryKey: teacherDashboardSummaryQueryKeys.forUser(userId),
    queryFn: () => {
      requireTeacherId(currentUser);
      return getTeacherDashboardSummary();
    },
    enabled: userId !== null,
    retry: shouldRetryCourseQuery,
    staleTime: 30_000,
  });

  return {
    ...query,
    authorizationStatus,
  };
}
