import { useMutation } from "@tanstack/react-query";
import type { ForgotPasswordRequest } from "@edutrack/contracts";

import { requestPasswordReset } from "../api/auth.api.js";

export function useForgotPassword() {
  return useMutation({
    mutationFn: (request: ForgotPasswordRequest) =>
      requestPasswordReset(request),
  });
}
