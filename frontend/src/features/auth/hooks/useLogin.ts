import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest } from "@edutrack/contracts";

import { loginUser } from "../api/auth.api.js";
import { currentUserQueryKey, loginMutationKey } from "./auth-query-keys.js";
import { teacherDashboardSummaryQueryKeys } from "../../teachers/hooks/teacher-dashboard-query-keys.js";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loginMutationKey,
    mutationFn: (request: LoginRequest) => loginUser(request),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: currentUserQueryKey }),
        queryClient.cancelQueries({ queryKey: ["admin"] }),
        queryClient.cancelQueries({
          queryKey: ["course-authoring", "courses"],
        }),
        queryClient.cancelQueries({
          queryKey: teacherDashboardSummaryQueryKeys.all,
        }),
      ]);

      queryClient.removeQueries({ queryKey: ["admin"] });
      queryClient.removeQueries({
        queryKey: ["course-authoring", "courses"],
      });
      queryClient.removeQueries({
        queryKey: teacherDashboardSummaryQueryKeys.all,
      });
      queryClient.setQueryData(currentUserQueryKey, null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: currentUserQueryKey,
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: currentUserQueryKey,
      });
    },
  });
}
