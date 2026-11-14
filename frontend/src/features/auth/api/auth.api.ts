import {
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  registrationRequestSchema,
  registrationResponseSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  currentUserResponseSchema,
  type CurrentUserResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type RegistrationRequest,
  type RegistrationResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";

export async function registerUser(
  input: RegistrationRequest,
): Promise<RegistrationResponse> {
  const request = registrationRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/auth/register", {
    method: "POST",
    body: request,
  });

  try {
    return registrationResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 201,
      title: "Invalid response",
      detail: "The server returned an unexpected registration response.",
    });
  }
}

export async function verifyEmail(
  input: VerifyEmailRequest,
): Promise<VerifyEmailResponse> {
  const request = verifyEmailRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/auth/verify-email", {
    method: "POST",
    body: request,
  });

  try {
    return verifyEmailResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected verification response.",
    });
  }
}

export async function requestPasswordReset(
  input: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> {
  const request = forgotPasswordRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: request,
  });

  try {
    return forgotPasswordResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 202,
      title: "Invalid response",
      detail: "The server returned an unexpected password recovery response.",
    });
  }
}

export async function resetPassword(
  input: ResetPasswordRequest,
): Promise<ResetPasswordResponse> {
  const request = resetPasswordRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/auth/reset-password", {
    method: "POST",
    body: request,
  });

  try {
    return resetPasswordResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected password reset response.",
    });
  }
}

export async function loginUser(input: LoginRequest): Promise<LoginResponse> {
  const request = loginRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/auth/login", {
    method: "POST",
    body: request,
  });

  try {
    return loginResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected login response.",
    });
  }
}

export async function logoutUser(): Promise<LogoutResponse> {
  const response = await apiRequest<unknown>("/api/v1/auth/logout", {
    method: "POST",
  });

  try {
    return logoutResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected logout response.",
    });
  }
}

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const response = await apiRequest<unknown>("/api/v1/auth/me");

  try {
    return currentUserResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected current-user response.",
    });
  }
}
