import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SubmitTeacherApplicationRequest } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { submitTeacherApplication } from "../api/teacher-applications.api.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { myTeacherApplicationQueryKey } from "./useMyTeacherApplication.js";

export const submitTeacherApplicationMutationKey = [
  "teacher-applications",
  "submit",
] as const;

export function useSubmitTeacherApplication() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const userId =
    currentUser.status === "authenticated" ? currentUser.user.id : null;

  return useMutation({
    mutationKey: submitTeacherApplicationMutationKey,
    mutationFn: (input: SubmitTeacherApplicationRequest) => {
      if (!userId) {
        throw new ApiError({
          status: 401,
          title: "Authentication required",
          detail: "Sign in before submitting a teacher application.",
        });
      }

      return submitTeacherApplication(input);
    },
    onSuccess: (application) => {
      if (userId) {
        queryClient.setQueryData(myTeacherApplicationQueryKey(userId), {
          application,
        });
      }
    },
  });
}
