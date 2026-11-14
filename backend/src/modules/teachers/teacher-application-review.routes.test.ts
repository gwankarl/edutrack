import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AdminTeacherApplicationListResponse,
  AdminTeacherApplicationResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { teacherApplicationReviewRoutes } from "./teacher-application-review.routes.js";
import type { TeacherApplicationReviewRouteServices } from "./teacher-application-review.routes.js";
import { TeacherApplicationNotFoundError } from "./teacher-application-review.service.js";

const applicationId = "550e8400-e29b-41d4-a716-446655440001";
const userId = "550e8400-e29b-41d4-a716-446655440002";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const pendingApplication: AdminTeacherApplicationResponse = {
  id: applicationId,
  applicant: {
    id: userId,
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  status: "pending",
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

const approvedApplication: AdminTeacherApplicationResponse = {
  ...pendingApplication,
  status: "approved",
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer: {
    id: "550e8400-e29b-41d4-a716-446655440003",
    displayName: "Synthetic Administrator",
    email: "admin@example.test",
  },
  reviewNotes: "Internal administrator review note.",
};

const listResponse: AdminTeacherApplicationListResponse = {
  items: [pendingApplication],
  pagination: {
    page: 2,
    pageSize: 5,
    totalItems: 6,
    totalPages: 2,
  },
};

type AuthMode = "administrator" | "student" | "unauthenticated" | "inactive";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "administrator") {
  const app = Fastify({ logger: false });

  const services: TeacherApplicationReviewRouteServices = {
    authenticate: async (request, reply) => {
      if (authMode === "unauthenticated" || authMode === "inactive") {
        reply.code(401).type("application/problem+json").send({
          type: "urn:edutrack:problem:authentication-required",
          title: "Authentication required",
          status: 401,
          detail: "A valid session is required.",
        });
        return;
      }

      request.authContext = {
        userId,
        user: {
          id: userId,
          displayName: "Synthetic Administrator",
          email: "admin@example.test",
        },
        roles: authMode === "administrator" ? ["administrator"] : ["student"],
      };
    },
    review: {
      listApplications: vi.fn(
        async (): Promise<AdminTeacherApplicationListResponse> => listResponse,
      ),
      getApplicationById: vi.fn(
        async (): Promise<AdminTeacherApplicationResponse> =>
          pendingApplication,
      ),
    },
  };

  await app.register(teacherApplicationReviewRoutes, {
    prefix: "/api/v1",
    environment,
    services,
  });
  apps.push(app);

  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("administrator teacher application review routes", () => {
  it("lists applications with validated filters and pagination", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/teacher-applications?status=pending&page=2&pageSize=5",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(listResponse);
    expect(services.review.listApplications).toHaveBeenCalledWith({
      status: "pending",
      page: 2,
      pageSize: 5,
    });
  });

  it("rejects invalid filters with HTTP 400 Problem Details", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/teacher-applications?status=unknown&page=0",
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
    expect(services.review.listApplications).not.toHaveBeenCalled();
  });

  it("returns application details for an administrator", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/teacher-applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(pendingApplication);
    expect(services.review.getApplicationById).toHaveBeenCalledWith(
      applicationId,
    );
  });

  it("returns reviewer details and internal notes only through the admin route", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.review.getApplicationById).mockResolvedValue(
      approvedApplication,
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/teacher-applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reviewer: { email: "admin@example.test" },
      reviewNotes: "Internal administrator review note.",
    });
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("sessionTokenHash");
  });

  it("rejects an invalid application UUID with HTTP 400", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/teacher-applications/not-a-uuid",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
    expect(services.review.getApplicationById).not.toHaveBeenCalled();
  });

  it("returns HTTP 401 when authentication fails", async () => {
    const { app, services } = await createHarness("unauthenticated");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/teacher-applications",
    });

    expect(response.statusCode).toBe(401);
    expect(services.review.listApplications).not.toHaveBeenCalled();
  });

  it("returns HTTP 401 for an inactive account", async () => {
    const { app, services } = await createHarness("inactive");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/teacher-applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(401);
    expect(services.review.getApplicationById).not.toHaveBeenCalled();
  });

  it("returns HTTP 403 when an authenticated user lacks the Administrator role", async () => {
    const { app, services } = await createHarness("student");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/teacher-applications",
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.review.listApplications).not.toHaveBeenCalled();
  });

  it("maps a missing application to HTTP 404 Problem Details", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.review.getApplicationById).mockRejectedValue(
      new TeacherApplicationNotFoundError(),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/teacher-applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:teacher-application-not-found",
      status: 404,
    });
  });
});
