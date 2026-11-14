export {
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from "./identity/recovery.js";

export {
  registrationEmailSchema,
  registrationPasswordSchema,
  registrationRequestSchema,
  registrationResponseSchema,
  type RegistrationRequest,
  type RegistrationResponse,
} from "./identity/registration.js";

export {
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
} from "./identity/login.js";

export {
  currentUserResponseSchema,
  currentUserRoleSchema,
  type CurrentUserResponse,
  type CurrentUserRole,
} from "./identity/current-user.js";

export {
  getMyTeacherApplicationResponseSchema,
  submitTeacherApplicationRequestSchema,
  teacherApplicationResponseSchema,
  teacherApplicationStatusSchema,
  type GetMyTeacherApplicationResponse,
  type SubmitTeacherApplicationRequest,
  type TeacherApplicationResponse,
  type TeacherApplicationStatus,
} from "./teacher-applications/application.js";

export { healthResponseSchema, type HealthResponse } from "./system/health.js";
