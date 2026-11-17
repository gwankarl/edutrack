import { useIsMutating, useQuery } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { getCurrentUser } from "../api/auth.api.js";
import { currentUserQueryKey, loginMutationKey } from "./auth-query-keys.js";

export { currentUserQueryKey } from "./auth-query-keys.js";

const CURRENT_USER_REFRESH_INTERVAL_MS = 60_000;

export type CurrentUserState =
  | { status: "loading"; user: null; error: null }
  | { status: "authenticated"; user: CurrentUserResponse; error: null }
  | { status: "unauthenticated"; user: null; error: null }
  | { status: "error"; user: null; error: Error };

export function useCurrentUser(): CurrentUserState {
  const loginPending = useIsMutating({ mutationKey: loginMutationKey }) > 0;
  const query = useQuery({
    queryKey: currentUserQueryKey,
    staleTime: 30_000,
    queryFn: async (): Promise<CurrentUserResponse | null> => {
      try {
        return await getCurrentUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }

        throw error;
      }
    },
    // Poll only while a session is authenticated. Login invalidates this query,
    // so newly authenticated users begin receiving role refreshes immediately.
    refetchInterval: (currentUserQuery) =>
      currentUserQuery.state.data ? CURRENT_USER_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Keep the last successful identity visible during background refreshes.
  // A 401 still resolves to null in queryFn and immediately signs the user out.
  if (query.data === null && loginPending) {
    return { status: "loading", user: null, error: null };
  }

  if (query.data === null) {
    return { status: "unauthenticated", user: null, error: null };
  }

  if (query.data !== undefined) {
    return { status: "authenticated", user: query.data, error: null };
  }

  if (query.isError) {
    return {
      status: "error",
      user: null,
      error:
        query.error instanceof Error
          ? query.error
          : new Error("Unable to load the current user."),
    };
  }

  return { status: "loading", user: null, error: null };
}
