import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

import { routeConfig, TeacherRouteGuard } from "./router.js";
import ProtectedRoute from "./ProtectedRoute.js";
import TeacherLayout from "../layouts/TeacherLayout.js";
import QuizEditorPage from "../../features/course-authoring/pages/QuizEditorPage.js";

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizId = "550e8400-e29b-41d4-a716-446655440022";

describe("quiz authoring routes", () => {
  it.each([
    [
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/new`,
      "courses/:courseId/topics/:topicId/quizzes/new",
    ],
    [
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
      "courses/:courseId/topics/:topicId/quizzes/:quizId",
    ],
  ])(
    "places %s under the authenticated Teacher layout",
    (path, expectedRoute) => {
      const matches = matchRoutes(routeConfig, path);

      expect(matches?.at(-1)?.route.path).toBe(expectedRoute);
      expect(matches?.at(-1)?.route.Component).toBe(QuizEditorPage);
      expect(
        matches?.some((match) => match.route.Component === ProtectedRoute),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherRouteGuard),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherLayout),
      ).toBe(true);
    },
  );
});
