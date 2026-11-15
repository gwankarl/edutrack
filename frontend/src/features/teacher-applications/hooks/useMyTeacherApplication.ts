import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@edutrack/contracts";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { getMyTeacherApplication } from "../api/teacher-applications.api.js";

export const myTeacherApplicationQueryKey = (userId: string | null) =>
  ["teacher-applications", "me", userId] as const;

export function useMyTeacherApplication() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const cachedUser = queryClient.getQueryData<CurrentUserResponse | null>(
    currentUserQueryKey,
  );

  const userId =
    currentUser.status === "authenticated"
      ? currentUser.user.id
      : currentUser.status === "loading"
        ? (cachedUser?.id ?? null)
        : null;

  const query = useQuery({
    queryKey: myTeacherApplicationQueryKey(userId),
    queryFn: getMyTeacherApplication,
    enabled: userId !== null,
  });

  return {
    ...query,
    authStatus: currentUser.status,
  };
}
