import { useQuery } from "@tanstack/react-query";

import { getMyTeacherApplication } from "../api/teacher-applications.api.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";

export const myTeacherApplicationQueryKey = (userId: string | null) =>
  ["teacher-applications", "me", userId] as const;

export function useMyTeacherApplication() {
  const currentUser = useCurrentUser();
  const userId =
    currentUser.status === "authenticated" ? currentUser.user.id : null;

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
