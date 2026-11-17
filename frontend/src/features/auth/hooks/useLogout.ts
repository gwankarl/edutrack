import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutUser } from "../api/auth.api.js";
import { currentUserQueryKey } from "./auth-query-keys.js";
import { teacherDashboardSummaryQueryKeys } from "../../teachers/hooks/teacher-dashboard-query-keys.js";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutUser(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: currentUserQueryKey }),
        queryClient.cancelQueries({ queryKey: ["teacher-applications"] }),
        queryClient.cancelQueries({ queryKey: ["admin"] }),
        queryClient.cancelQueries({
          queryKey: ["course-authoring", "courses"],
        }),
        queryClient.cancelQueries({
          queryKey: teacherDashboardSummaryQueryKeys.all,
        }),
      ]);

      queryClient.setQueryData(currentUserQueryKey, null);
      queryClient.removeQueries({ queryKey: ["teacher-applications"] });
      queryClient.removeQueries({ queryKey: ["admin"] });
      queryClient.removeQueries({
        queryKey: ["course-authoring", "courses"],
      });
      queryClient.removeQueries({
        queryKey: teacherDashboardSummaryQueryKeys.all,
      });
    },
  });
}
