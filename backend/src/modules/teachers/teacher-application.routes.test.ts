import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import type { TeacherApplicationResponse } from "@edutrack/contracts";
import {
  teacherApplicationRoutes,
  type TeacherApplicationRouteServices,
} from "./teacher-application.routes.js";
import { PendingTeacherApplicationExistsError } from "./teacher-application.repository.js";
import {
  TeacherApplicationAlreadyApprovedError,
  TeacherApplicationNotEligibleError,
  TeacherRoleAlreadyAssignedError,
} from "./teacher-application.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const pendingApplication: TeacherApplicationResponse = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  status: "pending",
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createRouteHarness(authenticated = true) {
  const app = Fastify({ logger: false });
  const services: TeacherApplicationRouteServices = {
    authenticate: async (request, reply) => {
      if (!authenticated) {
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
          displayName: "Synthetic Applicant",
          email: "applicant@example.test",
        },
        roles: ["student"],
      };
    },
    teacherApplications: {
      submitApplication: vi.fn(async () => pendingApplication),
      getMyApplication: vi.fn(async () => ({ application: null })),
    },
  };

  registerErrorHandler(app);
  await app.register(cookie);
  await app.register(teacherApplicationRoutes, {
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

describe("teacher application routes", () => {
  const allowedMutationHeaders = {
    origin: environment.FRONTEND_URL,
    "content-type": "application/json",
  };

  it("submits an authenticated application and returns HTTP 201", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(pendingApplication);
    expect(services.teacherApplications.submitApplication).toHaveBeenCalledWith(
      userId,
      {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    );
    expect(response.body).not.toContain("reviewNotes");
    expect(response.body).not.toContain("reviewedBy");
  });

  it("returns HTTP 200 and the latest application response", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.teacherApplications.getMyApplication).mockResolvedValue({
      application: pendingApplication,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher-applications/me",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ application: pendingApplication });
    expect(services.teacherApplications.getMyApplication).toHaveBeenCalledWith(
      userId,
    );
  });

  it("returns HTTP 200 with a null application when none exists", async () => {
    const { app } = await createRouteHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher-applications/me",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ application: null });
  });

  it("uses the authenticated user for retrieval and rejects unauthenticated GETs", async () => {
    const { app, services } = await createRouteHarness(false);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher-applications/me",
    });

    expect(response.statusCode).toBe(401);
    expect(
      services.teacherApplications.getMyApplication,
    ).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests with HTTP 401", async () => {
    const { app, services } = await createRouteHarness(false);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(
      services.teacherApplications.submitApplication,
    ).not.toHaveBeenCalled();
  });

  it("returns a validation Problem Details response and rejects client user IDs", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        userId: "client-supplied-id",
        motivation: "   ",
        qualifications: "Experience.",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
    expect(
      services.teacherApplications.submitApplication,
    ).not.toHaveBeenCalled();
  });

  it("does not accept an owner ID in an otherwise valid submission", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        userId: "client-supplied-id",
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(
      services.teacherApplications.submitApplication,
    ).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin before calling the service", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: {
        ...allowedMutationHeaders,
        origin: "https://attacker.example",
      },
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:csrf-rejected",
      status: 403,
    });
    expect(
      services.teacherApplications.submitApplication,
    ).not.toHaveBeenCalled();
  });

  it("maps duplicate applications to HTTP 409 Problem Details", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.teacherApplications.submitApplication).mockRejectedValue(
      new PendingTeacherApplicationExistsError(),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:teacher-application-pending",
      status: 409,
    });
  });

  it("maps ineligible accounts to HTTP 403 Problem Details", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.teacherApplications.submitApplication).mockRejectedValue(
      new TeacherApplicationNotEligibleError(),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:teacher-application-ineligible",
      status: 403,
    });
  });

  it.each([
    [
      "approved applications",
      new TeacherApplicationAlreadyApprovedError(),
      "urn:edutrack:problem:teacher-application-approved",
    ],
    [
      "existing Teacher roles",
      new TeacherRoleAlreadyAssignedError(),
      "urn:edutrack:problem:teacher-role-already-assigned",
    ],
  ])("maps %s to HTTP 409 Problem Details", async (_label, error, type) => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.teacherApplications.submitApplication).mockRejectedValue(
      error,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher-applications",
      headers: allowedMutationHeaders,
      payload: {
        motivation: "I want to support learners.",
        qualifications: "Synthetic teaching experience.",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({ type, status: 409 });
  });

  it("rejects a service response containing internal review notes", async () => {
    const { app, services } = await createRouteHarness();
    const responseWithInternalNotes = {
      application: {
        id: pendingApplication.id,
        status: "rejected",
        motivation: pendingApplication.motivation,
        qualifications: pendingApplication.qualifications,
        submittedAt: pendingApplication.submittedAt,
        reviewedAt: "2026-11-15T12:00:00.000Z",
        rejectionReason: "Please provide more relevant experience.",
        reviewNotes: "Private administrator note.",
      },
    } as never;
    vi.mocked(services.teacherApplications.getMyApplication).mockResolvedValue(
      responseWithInternalNotes,
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher-applications/me",
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("Private administrator note.");
  });
});
