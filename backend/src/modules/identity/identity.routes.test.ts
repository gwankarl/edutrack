import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  identityRoutes,
  type IdentityRouteServices,
} from "./identity.routes.js";
import { InvalidVerificationTokenError } from "./verification-token.service.js";

const safeUserId = "550e8400-e29b-41d4-a716-446655440000";
const genericForgotPasswordResponse = {
  message:
    "If an account exists for that email, a password reset link will be sent.",
};

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
};

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createRouteHarness() {
  const app = Fastify({ logger: false });
  const services: IdentityRouteServices = {
    registration: {
      register: vi.fn(async () => ({
        id: safeUserId,
        displayName: "Synthetic Student",
        email: "student@example.test",
      })),
    },
    emailVerification: {
      verifyEmail: vi.fn(async () => ({
        userId: safeUserId,
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
    },
    passwordRecovery: {
      requestReset: vi.fn(async () => genericForgotPasswordResponse),
      resetPassword: vi.fn(async () => ({
        message: "Password has been reset.",
      })),
    },
  };

  registerErrorHandler(app);
  await app.register(identityRoutes, {
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

describe("identity recovery routes", () => {
  it("verifies email without returning user or token details", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: "synthetic-verification-token-1234567890" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ message: "Email verified." });
    expect(response.body).not.toContain("synthetic-verification-token");
    expect(services.emailVerification.verifyEmail).toHaveBeenCalledWith(
      "synthetic-verification-token-1234567890",
    );
  });

  it("returns a generic forgot-password response", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "  STUDENT@example.test " },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual(genericForgotPasswordResponse);
    expect(services.passwordRecovery.requestReset).toHaveBeenCalledWith(
      "student@example.test",
    );
    expect(response.body).not.toContain("token");
  });

  it("resets a password without returning the supplied token or hash", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: "synthetic-password-reset-token-123456",
        newPassword: "a sufficiently long synthetic passphrase",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Password has been reset." });
    expect(response.body).not.toContain("synthetic-password-reset-token");
    expect(response.body).not.toContain("passwordHash");
    expect(services.passwordRecovery.resetPassword).toHaveBeenCalledWith(
      "synthetic-password-reset-token-123456",
      "a sufficiently long synthetic passphrase",
    );
  });

  it("returns the same Problem Details shape for an invalid verification token", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.emailVerification.verifyEmail).mockRejectedValue(
      new InvalidVerificationTokenError(),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: "synthetic-invalid-verification-token-123456" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toEqual({
      type: "urn:edutrack:problem:invalid-token",
      title: "Invalid or expired token",
      status: 400,
      detail: "The token is invalid, expired, or already used.",
    });
    expect(response.body).not.toContain("synthetic-invalid");
  });

  it("rejects invalid bodies without reflecting secrets", async () => {
    const { app, services } = await createRouteHarness();
    const secret = "short-secret";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: secret, newPassword: "weak" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
      errors: expect.any(Array),
    });
    expect(response.body).not.toContain(secret);
    expect(services.passwordRecovery.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and non-JSON requests before calling services", async () => {
    const { app, services } = await createRouteHarness();
    const crossOriginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      headers: { origin: "https://attacker.example" },
      payload: { email: "student@example.test" },
    });
    const formResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      headers: { "content-type": "text/plain" },
      payload: "student@example.test",
    });

    expect(crossOriginResponse.statusCode).toBe(403);
    expect(crossOriginResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(formResponse.statusCode).toBe(415);
    expect(formResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.passwordRecovery.requestReset).not.toHaveBeenCalled();
  });

  it("rate-limits verification requests with Problem Details", async () => {
    const { app } = await createRouteHarness();
    const sendRequest = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: "synthetic-verification-token-1234567890" },
      });

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      expect((await sendRequest()).statusCode).toBe(200);
    }

    const limitedResponse = await sendRequest();
    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(limitedResponse.json()).toMatchObject({
      type: "urn:edutrack:problem:rate-limit-exceeded",
      status: 429,
    });
  });
});
