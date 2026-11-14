import { useMutation } from "@tanstack/react-query";
import type { ResetPasswordRequest } from "@edutrack/contracts";

import { resetPassword } from "../api/auth.api.js";

export function useResetPassword() {
  return useMutation({
    mutationFn: (request: ResetPasswordRequest) => resetPassword(request),
  });
}
