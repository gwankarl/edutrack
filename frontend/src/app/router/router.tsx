import { createBrowserRouter } from "react-router";
import type { RouteObject } from "react-router";

import ForgotPasswordPage from "../../features/auth/pages/ForgotPasswordPage.js";
import RegistrationConfirmationPage from "../../features/auth/pages/RegistrationConfirmationPage.js";
import RegisterPage from "../../features/auth/pages/RegisterPage.js";
import ResetPasswordPage from "../../features/auth/pages/ResetPasswordPage.js";
import VerifyEmailPage from "../../features/auth/pages/VerifyEmailPage.js";
import LoginPage from "../../features/auth/pages/LoginPage.js";
import ProfilePage from "../../features/account/pages/ProfilePage.js";
import TeacherApplicationPage from "../../features/teacher-applications/pages/TeacherApplicationPage.js";
import TeacherApplicationStatusPage from "../../features/teacher-applications/pages/TeacherApplicationStatusPage.js";
import TeacherApplicationsPage from "../../features/administration/teacher-applications/pages/TeacherApplicationsPage.js";
import TeacherApplicationReviewPage from "../../features/administration/teacher-applications/pages/TeacherApplicationReviewPage.js";
import AppLayout from "../layouts/AppLayout.js";
import HomePage from "./HomePage.js";
import NotFoundPage from "./NotFoundPage.js";
import ProtectedRoute from "./ProtectedRoute.js";
import RoleGuard from "./RoleGuard.js";

export function AdministratorRouteGuard() {
  return <RoleGuard allowedRoles={["administrator"]} />;
}

export const routeConfig: RouteObject[] = [
  {
    Component: AppLayout,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "register",
        Component: RegisterPage,
      },
      {
        path: "registration-confirmation",
        Component: RegistrationConfirmationPage,
      },
      {
        path: "verify-email",
        Component: VerifyEmailPage,
      },
      {
        path: "forgot-password",
        Component: ForgotPasswordPage,
      },
      {
        path: "reset-password",
        Component: ResetPasswordPage,
      },
      {
        path: "login",
        Component: LoginPage,
      },
      {
        Component: ProtectedRoute,
        children: [
          {
            path: "profile",
            Component: ProfilePage,
          },
          {
            path: "teacher/apply",
            Component: TeacherApplicationPage,
          },
          {
            path: "teacher/application-status",
            Component: TeacherApplicationStatusPage,
          },
          {
            Component: AdministratorRouteGuard,
            children: [
              {
                path: "admin/teacher-applications",
                Component: TeacherApplicationsPage,
              },
              {
                path: "admin/teacher-applications/:applicationId",
                Component: TeacherApplicationReviewPage,
              },
            ],
          },
        ],
      },
      {
        path: "*",
        Component: NotFoundPage,
      },
    ],
  },
];

export const router = createBrowserRouter(routeConfig);
