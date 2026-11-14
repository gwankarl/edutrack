import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutUser } from "../api/auth.api.js";
import { currentUserQueryKey } from "./auth-query-keys.js";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutUser(),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: currentUserQueryKey });
      await queryClient.cancelQueries({
        queryKey: ["teacher-applications"],
      });
      queryClient.setQueryData(currentUserQueryKey, null);
      queryClient.removeQueries({ queryKey: ["teacher-applications"] });
    },
  });
}
