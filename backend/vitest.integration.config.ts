import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration files share edutrack_test; serialize files so global list
    // counts and cleanup from one suite cannot race another suite.
    fileParallelism: false,
    include: [
      "src/modules/health/health.integration.test.ts",
      "src/modules/identity/identity.repository.integration.test.ts",
      "src/modules/identity/identity.routes.integration.test.ts",
      "src/modules/identity/verification-token.repository.integration.test.ts",
      "tests/integration/**/*.integration.test.ts",
      "src/modules/teachers/teacher-application.repository.integration.test.ts",
      "src/modules/teachers/teacher-application-review.repository.integration.test.ts",
      "src/modules/teachers/teacher-application-decision.repository.integration.test.ts",
      "src/modules/teachers/teacher-application-decision.service.integration.test.ts",
      "src/modules/academic-catalog/academic-catalog.repository.integration.test.ts",
      "src/infrastructure/database/seeds/academic-catalog.seed.integration.test.ts",
      "src/modules/courses/course.repository.integration.test.ts",
      "src/modules/courses/topic.repository.integration.test.ts",
      "src/modules/courses/lesson.repository.integration.test.ts",
      "src/modules/courses/quiz.repository.integration.test.ts",
      "src/modules/courses/quiz-question.repository.integration.test.ts",
      "src/modules/courses/quiz-option.repository.integration.test.ts",
    ],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
