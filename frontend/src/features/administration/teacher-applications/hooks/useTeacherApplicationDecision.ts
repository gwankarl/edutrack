import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ApproveTeacherApplicationRequest,
  RejectTeacherApplicationRequest,
} from "@edutrack/contracts";

import { ApiError } from "../../../../lib/api/api-error.js";
import { myTeacherApplicationQueryKey } from "../../../teacher-applications/hooks/useMyTeacherApplication.js";
import { useCurrentUser } from "../../../auth/hooks/useCurrentUser.js";
import {
  approveAdminTeacherApplication,
  rejectAdminTeacherApplication,
} from "../api/teacher-application-review.api.js";
import {
  adminTeacherApplicationQueryKeys,
  getAdministratorId,
  requireAdministratorId,
} from "./useTeacherApplications.js";

type DecisionInput =
  | {
      decision: "approve";
      applicationId: string;
      input: ApproveTeacherApplicationRequest;
    }
  | {
      decision: "reject";
      applicationId: string;
      input: RejectTeacherApplicationRequest;
    };

export function useTeacherApplicationDecision() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const submissionInProgress = useRef(false);

  const mutation = useMutation({
    mutationFn: (variables: DecisionInput) => {
      requireAdministratorId(currentUser);

      if (variables.decision === "approve") {
        return approveAdminTeacherApplication(
          variables.applicationId,
          variables.input,
        );
      }

      return rejectAdminTeacherApplication(
        variables.applicationId,
        variables.input,
      );
    },
    onSuccess: async () => {
      const administratorId = getAdministratorId(currentUser);

      if (!administratorId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminTeacherApplicationQueryKeys.lists(administratorId),
        }),
        queryClient.invalidateQueries({
          queryKey: adminTeacherApplicationQueryKeys.details(administratorId),
        }),
        queryClient.invalidateQueries({
          queryKey: myTeacherApplicationQueryKey(administratorId),
        }),
      ]);
    },
  });

  const submitDecision = useCallback(
    async (variables: DecisionInput) => {
      if (submissionInProgress.current) {
        throw new ApiError({
          status: 409,
          title: "Decision already submitting",
          detail: "Wait for the current decision request to finish.",
        });
      }

      submissionInProgress.current = true;

      try {
        return await mutation.mutateAsync(variables);
      } finally {
        submissionInProgress.current = false;
      }
    },
    [mutation.mutateAsync],
  );

  return {
    data: mutation.data,
    error: mutation.error,
    isError: mutation.isError,
    isIdle: mutation.isIdle,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
    submitDecision,
  };
}
