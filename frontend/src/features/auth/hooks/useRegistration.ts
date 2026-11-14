import { useMutation } from "@tanstack/react-query";
import type { RegistrationRequest } from "@edutrack/contracts";

import { registerUser } from "../api/auth.api.js";

export function useRegistration() {
  return useMutation({
    mutationFn: (request: RegistrationRequest) => registerUser(request),
  });
}
