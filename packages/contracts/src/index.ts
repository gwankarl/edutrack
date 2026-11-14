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

export {
  ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE,
  ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE_SIZE,
  ADMIN_TEACHER_APPLICATION_MAX_PAGE_SIZE,
  adminTeacherApplicationListQuerySchema,
  adminTeacherApplicationParamsSchema,
  adminTeacherApplicationResponseSchema,
  adminTeacherApplicationListResponseSchema,
  type AdminTeacherApplicationListQuery,
  type AdminTeacherApplicationParams,
  type AdminTeacherApplicationResponse,
  type AdminTeacherApplicationListResponse,
} from "./teacher-applications/admin.js";

export {
  ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH,
  adminTeacherApplicationDecisionParamsSchema,
  adminTeacherApplicationDecisionResponseSchema,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
  type AdminTeacherApplicationDecisionParams,
  type AdminTeacherApplicationDecisionResponse,
  type ApproveTeacherApplicationRequest,
  type RejectTeacherApplicationRequest,
} from "./teacher-applications/admin-decisions.js";

export { healthResponseSchema, type HealthResponse } from "./system/health.js";
