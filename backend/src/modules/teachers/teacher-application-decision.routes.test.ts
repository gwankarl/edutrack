import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminTeacherApplicationDecisionResponse } from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { teacherApplicationDecisionRoutes } from "./teacher-application-decision.routes.js";
import type { TeacherApplicationDecisionRouteServices } from "./teacher-application-decision.routes.js";
import {
  TeacherApplicationDecisionConflictError,
  TeacherApplicationDecisionNotFoundError,
  TeacherApplicationDecisionValidationError,
} from "./teacher-application-decision.service.js";

const applicationId = "550e8400-e29b-41d4-a716-446655440001";
const administratorId = "550e8400-e29b-41d4-a716-446655440002";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const approvedResponse: AdminTeacherApplicationDecisionResponse = {
  applicationId,
  status: "approved",
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer: {
    id: administratorId,
    displayName: "Synthetic Administrator",
    email: "admin@example.test",
  },
};

const rejectedResponse: AdminTeacherApplicationDecisionResponse = {
  ...approvedResponse,
  status: "rejected",
};

type AuthMode = "administrator" | "student" | "unauthenticated" | "inactive";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "administrator") {
  const app = Fastify({ logger: false });

  const services: TeacherApplicationDecisionRouteServices = {
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
        userId: administratorId,
        user: {
          id: administratorId,
          displayName: "Synthetic Administrator",
          email: "admin@example.test",
        },
        roles: authMode === "administrator" ? ["administrator"] : ["student"],
      };
    },
    decisions: {
      approveApplication: vi.fn(async () => approvedResponse),
      rejectApplication: vi.fn(async () => rejectedResponse),
    },
  };

  await app.register(teacherApplicationDecisionRoutes, {
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

describe("teacher application decision routes", () => {
  const allowedHeaders = {
    origin: environment.FRONTEND_URL,
    "content-type": "application/json",
  };

  it("approves an application and uses the authenticated administrator ID", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      headers: allowedHeaders,
      payload: { reviewNotes: "  Synthetic internal note.  " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(approvedResponse);
    expect(services.decisions.approveApplication).toHaveBeenCalledWith(
      applicationId,
      administratorId,
      { reviewNotes: "Synthetic internal note." },
    );
    expect(response.body).not.toContain("reviewNotes");
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("sessionToken");
  });

  it("rejects an application with the validated request body", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/reject`,
      headers: allowedHeaders,
      payload: {
        rejectionReason: "  Please provide more experience.  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rejectedResponse);
    expect(services.decisions.rejectApplication).toHaveBeenCalledWith(
      applicationId,
      administratorId,
      { rejectionReason: "Please provide more experience." },
    );
  });

  it.each([
    [
      "approve",
      `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      { reviewNotes: "A note.", administratorId },
    ],
    [
      "reject",
      `/api/v1/admin/teacher-applications/${applicationId}/reject`,
      { rejectionReason: "   " },
    ],
  ])("returns HTTP 400 for invalid %s input", async (_action, url, payload) => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url,
      headers: allowedHeaders,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
    expect(services.decisions.approveApplication).not.toHaveBeenCalled();
    expect(services.decisions.rejectApplication).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for an invalid application UUID", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/teacher-applications/not-a-uuid/approve",
      headers: allowedHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
    expect(services.decisions.approveApplication).not.toHaveBeenCalled();
  });

  it.each(["approve", "reject"] as const)(
    "returns HTTP 401 for unauthenticated %s requests",
    async (action) => {
      const { app, services } = await createHarness("unauthenticated");

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/admin/teacher-applications/${applicationId}/${action}`,
        headers: allowedHeaders,
        payload:
          action === "approve" ? {} : { rejectionReason: "A valid reason." },
      });

      expect(response.statusCode).toBe(401);
      expect(services.decisions.approveApplication).not.toHaveBeenCalled();
      expect(services.decisions.rejectApplication).not.toHaveBeenCalled();
    },
  );

  it("rejects an inactive account with HTTP 401", async () => {
    const { app, services } = await createHarness("inactive");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      headers: allowedHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(services.decisions.approveApplication).not.toHaveBeenCalled();
  });

  it.each(["approve", "reject"] as const)(
    "returns HTTP 403 for authenticated non-administrator %s requests",
    async (action) => {
      const { app, services } = await createHarness("student");

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/admin/teacher-applications/${applicationId}/${action}`,
        headers: allowedHeaders,
        payload:
          action === "approve" ? {} : { rejectionReason: "A valid reason." },
      });

      expect(response.statusCode).toBe(403);
      expect(services.decisions.approveApplication).not.toHaveBeenCalled();
      expect(services.decisions.rejectApplication).not.toHaveBeenCalled();
    },
  );

  it("rejects a foreign Origin before reaching the service", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      headers: {
        ...allowedHeaders,
        origin: "https://attacker.example",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:csrf-rejected",
      status: 403,
    });
    expect(services.decisions.approveApplication).not.toHaveBeenCalled();
  });

  it("maps missing applications to HTTP 404 Problem Details", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.decisions.approveApplication).mockRejectedValue(
      new TeacherApplicationDecisionNotFoundError(),
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      headers: allowedHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:teacher-application-not-found",
      status: 404,
    });
  });

  it("maps already-reviewed applications to HTTP 409 Problem Details", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.decisions.rejectApplication).mockRejectedValue(
      new TeacherApplicationDecisionConflictError(),
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/reject`,
      headers: allowedHeaders,
      payload: { rejectionReason: "A valid reason." },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:teacher-application-decision-conflict",
      status: 409,
    });
  });

  it("maps service validation errors to HTTP 400", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.decisions.approveApplication).mockRejectedValue(
      new TeacherApplicationDecisionValidationError([]),
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/admin/teacher-applications/${applicationId}/approve`,
      headers: allowedHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
  });
});
