import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, matchRoutes } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import TeacherLayout from "../layouts/TeacherLayout.js";
import TeacherWorkspacePage from "../../features/teachers/pages/TeacherWorkspacePage.js";
import TeacherCoursesPage from "../../features/course-authoring/pages/TeacherCoursesPage.js";
import CreateCoursePage from "../../features/course-authoring/pages/CreateCoursePage.js";
import TeacherCourseDetailsPage from "../../features/course-authoring/pages/TeacherCourseDetailsPage.js";
import CourseTopicsPage from "../../features/course-authoring/pages/CourseTopicsPage.js";
import TopicDetailsPage from "../../features/course-authoring/pages/TopicDetailsPage.js";
import LessonEditorPage from "../../features/course-authoring/pages/LessonEditorPage.js";
import ProtectedRoute from "./ProtectedRoute.js";
import {
  AdministratorRouteGuard,
  routeConfig,
  TeacherRouteGuard,
} from "./router.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("application routes", () => {
  it.each([
    ["/register", "register"],
    ["/registration-confirmation", "registration-confirmation"],
    ["/verify-email", "verify-email"],
    ["/forgot-password", "forgot-password"],
    ["/reset-password", "reset-password"],
  ])("matches the public route %s", (pathname, expectedPath) => {
    const matches = matchRoutes(routeConfig, pathname);

    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
  });

  it.each([
    ["/teacher/apply", "teacher/apply"],
    ["/teacher/application-status", "teacher/application-status"],
  ])("protects the %s route", (pathname, expectedPath) => {
    const matches = matchRoutes(routeConfig, pathname);

    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
  });

  it("preserves Home and the Not Found route", () => {
    expect(matchRoutes(routeConfig, "/")).not.toBeNull();

    const notFoundMatches = matchRoutes(routeConfig, "/unknown-page");
    expect(notFoundMatches?.at(-1)?.route.path).toBe("*");
  });

  it("matches the login route", () => {
    const matches = matchRoutes(routeConfig, "/login");

    expect(matches?.at(-1)?.route.path).toBe("login");
  });

  it("places Profile under the authenticated route guard", () => {
    const matches = matchRoutes(routeConfig, "/profile");

    expect(matches?.at(-1)?.route.path).toBe("profile");
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
  });

  it("places the Teacher landing page under authentication and Teacher role guards", () => {
    const matches = matchRoutes(routeConfig, "/teacher");

    expect(matches).not.toBeNull();
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
    expect(
      matches?.some((match) => match.route.Component === TeacherRouteGuard),
    ).toBe(true);
    expect(
      matches?.some((match) => match.route.Component === TeacherLayout),
    ).toBe(true);
    expect(matches?.at(-1)?.route.Component).toBe(TeacherWorkspacePage);
  });

  it.each([
    ["/teacher/courses", "courses", TeacherCoursesPage],
    ["/teacher/courses/new", "courses/new", CreateCoursePage],
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020",
      "courses/:courseId",
      TeacherCourseDetailsPage,
    ],
  ])(
    "places %s under authentication, the Teacher role, and TeacherLayout",
    (pathname, routePath, pageComponent) => {
      const matches = matchRoutes(routeConfig, pathname);

      expect(matches).not.toBeNull();
      expect(
        matches?.some((match) => match.route.Component === ProtectedRoute),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherRouteGuard),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherLayout),
      ).toBe(true);
      expect(matches?.at(-1)?.route.path).toBe(routePath);
      expect(matches?.at(-1)?.route.Component).toBe(pageComponent);
    },
  );

  it.each([
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020/topics",
      "courses/:courseId/topics",
      CourseTopicsPage,
    ],
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020/topics/new",
      "courses/:courseId/topics/new",
      TopicDetailsPage,
    ],
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020/topics/550e8400-e29b-41d4-a716-446655440021",
      "courses/:courseId/topics/:topicId",
      TopicDetailsPage,
    ],
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020/topics/550e8400-e29b-41d4-a716-446655440021/lessons/new",
      "courses/:courseId/topics/:topicId/lessons/new",
      LessonEditorPage,
    ],
    [
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020/topics/550e8400-e29b-41d4-a716-446655440021/lessons/550e8400-e29b-41d4-a716-446655440022",
      "courses/:courseId/topics/:topicId/lessons/:lessonId",
      LessonEditorPage,
    ],
  ])(
    "places course authoring route %s under authentication, Teacher guard, and TeacherLayout",
    (pathname, routePath, pageComponent) => {
      const matches = matchRoutes(routeConfig, pathname);

      expect(matches).not.toBeNull();
      expect(
        matches?.some((match) => match.route.Component === ProtectedRoute),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherRouteGuard),
      ).toBe(true);
      expect(
        matches?.some((match) => match.route.Component === TeacherLayout),
      ).toBe(true);
      expect(matches?.at(-1)?.route.path).toBe(routePath);
      expect(matches?.at(-1)?.route.Component).toBe(pageComponent);
    },
  );

  it.each([
    "/admin/teacher-applications",
    "/admin/teacher-applications/550e8400-e29b-41d4-a716-446655440001",
  ])("protects administrator route %s with both guards", (pathname) => {
    const matches = matchRoutes(routeConfig, pathname);

    expect(matches).not.toBeNull();
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
    expect(
      matches?.some(
        (match) => match.route.Component === AdministratorRouteGuard,
      ),
    ).toBe(true);
    expect(matches?.at(-1)?.route.path).toBe(
      pathname.endsWith("/teacher-applications")
        ? "admin/teacher-applications"
        : "admin/teacher-applications/:applicationId",
    );
  });

  it("activates and revokes Teacher route access from refreshed backend roles without login", async () => {
    let roles = ["student"];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/v1/auth/me") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "00000000-0000-4000-8000-000000000001",
              displayName: "Ada Teacher",
              email: "ada@example.test",
              emailVerified: true,
              accountStatus: "active",
              roles,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url === "/api/v1/teacher-applications/me") {
        return Promise.resolve(
          new Response(JSON.stringify({ application: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(routeConfig, {
      initialEntries: ["/teacher"],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Access denied" }),
    ).toBeVisible();

    roles = ["student", "teacher"];
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada Teacher!" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.anything(),
    );

    roles = ["student"];
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

    expect(
      await screen.findByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    router.dispose();
    queryClient.clear();
  });
});
