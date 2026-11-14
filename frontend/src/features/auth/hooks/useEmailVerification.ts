import { useMutation } from "@tanstack/react-query";
import type { VerifyEmailRequest } from "@edutrack/contracts";

import { verifyEmail } from "../api/auth.api.js";

export function useEmailVerification() {
  return useMutation({
    mutationFn: (request: VerifyEmailRequest) => verifyEmail(request),
  });
}
