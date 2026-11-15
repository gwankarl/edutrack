import { useQuery } from "@tanstack/react-query";

import { adminTeacherApplicationParamsSchema } from "@edutrack/contracts";

import { useCurrentUser } from "../../../auth/hooks/useCurrentUser.js";
import { getAdminTeacherApplication } from "../api/teacher-application-review.api.js";
import {
  adminTeacherApplicationQueryKeys,
  getAdministratorAccessStatus,
  getAdministratorId,
  requireAdministratorId,
  shouldRetry,
} from "./useTeacherApplications.js";

export function useTeacherApplicationDetail(
  applicationId: string | null | undefined,
) {
  const currentUser = useCurrentUser();
  const parsedParams = adminTeacherApplicationParamsSchema.safeParse({
    applicationId,
  });
  const administratorId = getAdministratorId(currentUser);

  const query = useQuery({
    queryKey: adminTeacherApplicationQueryKeys.detail(
      administratorId,
      applicationId ?? null,
    ),
    queryFn: () => {
      requireAdministratorId(currentUser);

      if (!parsedParams.success) {
        throw parsedParams.error;
      }

      return getAdminTeacherApplication(parsedParams.data.applicationId);
    },
    enabled: administratorId !== null && parsedParams.success,
    retry: shouldRetry,
  });

  return {
    ...query,
    authorizationStatus: getAdministratorAccessStatus(currentUser),
    validationError: parsedParams.success ? null : parsedParams.error,
  };
}
