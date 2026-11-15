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

export {
  academicLevelListResponseSchema,
  academicLevelResponseSchema,
  educationStageSchema,
  type AcademicLevelListResponse,
  type AcademicLevelResponse,
  type EducationStage,
} from "./catalog/academic-levels.js";

export {
  subjectListResponseSchema,
  subjectResponseSchema,
  type SubjectListResponse,
  type SubjectResponse,
} from "./catalog/subjects.js";

export {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_TITLE_MAX_LENGTH,
  TEACHER_COURSE_DEFAULT_PAGE,
  TEACHER_COURSE_DEFAULT_PAGE_SIZE,
  TEACHER_COURSE_MAX_PAGE_SIZE,
  courseStatusSchema,
  createTeacherCourseRequestSchema,
  teacherCourseListQuerySchema,
  teacherCourseListResponseSchema,
  teacherCourseParamsSchema,
  teacherCourseResponseSchema,
  updateTeacherCourseRequestSchema,
  type CourseStatus,
  type CreateTeacherCourseRequest,
  type TeacherCourseListQuery,
  type TeacherCourseListResponse,
  type TeacherCourseParams,
  type TeacherCourseResponse,
  type UpdateTeacherCourseRequest,
} from "./courses/courses.js";

export {
  TOPIC_DESCRIPTION_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
  createTeacherTopicRequestSchema,
  reorderTeacherTopicsRequestSchema,
  teacherCourseTopicParamsSchema,
  teacherTopicCollectionParamsSchema,
  teacherTopicListResponseSchema,
  teacherTopicResponseSchema,
  updateTeacherTopicRequestSchema,
  type CreateTeacherTopicRequest,
  type ReorderTeacherTopicsRequest,
  type TeacherCourseTopicParams,
  type TeacherTopicCollectionParams,
  type TeacherTopicListResponse,
  type TeacherTopicResponse,
  type UpdateTeacherTopicRequest,
} from "./courses/topics.js";

export {
  LESSON_TITLE_MAX_LENGTH,
  createTeacherLessonRequestSchema,
  lessonContentSchema,
  teacherCourseTopicLessonParamsSchema,
  teacherLessonListResponseSchema,
  teacherLessonResponseSchema,
  teacherTopicLessonCollectionParamsSchema,
  reorderTeacherLessonsRequestSchema,
  updateTeacherLessonRequestSchema,
  type CreateTeacherLessonRequest,
  type ReorderTeacherLessonsRequest,
  type LessonContent,
  type TeacherCourseTopicLessonParams,
  type TeacherLessonListResponse,
  type TeacherLessonResponse,
  type TeacherTopicLessonCollectionParams,
  type UpdateTeacherLessonRequest,
} from "./courses/lessons.js";

export {
  QUIZ_DESCRIPTION_MAX_LENGTH,
  QUIZ_OPTION_TEXT_MAX_LENGTH,
  QUIZ_QUESTION_TEXT_MAX_LENGTH,
  QUIZ_TITLE_MAX_LENGTH,
  createTeacherQuizOptionRequestSchema,
  createTeacherQuizQuestionRequestSchema,
  createTeacherQuizRequestSchema,
  reorderTeacherQuizzesRequestSchema,
  reorderTeacherQuizQuestionsRequestSchema,
  reorderTeacherQuizOptionsRequestSchema,
  teacherQuizDetailResponseSchema,
  teacherQuizListResponseSchema,
  teacherQuizOptionListResponseSchema,
  teacherQuizOptionParamsSchema,
  teacherQuizOptionResponseSchema,
  teacherQuizQuestionCollectionParamsSchema,
  teacherQuizQuestionListResponseSchema,
  teacherQuizQuestionParamsSchema,
  teacherQuizQuestionResponseSchema,
  teacherQuizResponseSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
  updateTeacherQuizOptionRequestSchema,
  updateTeacherQuizQuestionRequestSchema,
  updateTeacherQuizRequestSchema,
  type CreateTeacherQuizOptionRequest,
  type CreateTeacherQuizQuestionRequest,
  type CreateTeacherQuizRequest,
  type ReorderTeacherQuizzesRequest,
  type ReorderTeacherQuizQuestionsRequest,
  type ReorderTeacherQuizOptionsRequest,
  type TeacherQuizDetailResponse,
  type TeacherQuizListResponse,
  type TeacherQuizOptionParams,
  type TeacherQuizOptionListResponse,
  type TeacherQuizOptionResponse,
  type TeacherQuizQuestionCollectionParams,
  type TeacherQuizQuestionListResponse,
  type TeacherQuizQuestionParams,
  type TeacherQuizQuestionResponse,
  type TeacherQuizResponse,
  type TeacherTopicQuizCollectionParams,
  type TeacherTopicQuizParams,
  type UpdateTeacherQuizOptionRequest,
  type UpdateTeacherQuizQuestionRequest,
  type UpdateTeacherQuizRequest,
} from "./courses/quizzes.js";

export { healthResponseSchema, type HealthResponse } from "./system/health.js";
