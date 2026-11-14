import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  identityRoutes,
  type IdentityRouteServices,
} from "./identity.routes.js";
import { InvalidCredentialsError } from "./login.service.js";
import { InvalidVerificationTokenError } from "./verification-token.service.js";

const safeUserId = "550e8400-e29b-41d4-a716-446655440000";
const sessionToken = "synthetic-session-token-that-must-not-be-in-json";
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
  SESSION_TTL_SECONDS: 604800,
};

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createRouteHarness(routeEnvironment: Environment = environment) {
  const app = Fastify({ logger: false });
  const services: IdentityRouteServices = {
    registration: {
      register: vi.fn(async () => ({
        id: safeUserId,
        displayName: "Synthetic Student",
        email: "student@example.test",
      })),
    },
    currentUser: {
      getCurrentUser: vi.fn(async () => ({
        id: safeUserId,
        displayName: "Synthetic Student",
        email: "student@example.test",
        emailVerified: true,
        accountStatus: "active",
        roles: ["student", "teacher"] as (
          "student" | "teacher" | "administrator"
        )[],
      })),
    },
    authenticate: vi.fn(async (request) => {
      request.authContext = {
        userId: safeUserId,
        user: {
          id: safeUserId,
          displayName: "Synthetic Student",
          email: "student@example.test",
        },
        roles: ["student", "teacher"] as (
          "student" | "teacher" | "administrator"
        )[],
      };
    }),
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
    login: {
      login: vi.fn(async () => ({
        user: {
          id: safeUserId,
          displayName: "Synthetic Student",
          email: "student@example.test",
        },
        sessionToken,
        sessionExpiresAt: new Date("2026-01-08T00:00:00.000Z"),
      })),
    },
    sessions: {
      revokeSession: vi.fn(async () => true),
    },
  };

  registerErrorHandler(app);
  await app.register(cookie);
  await app.register(identityRoutes, {
    prefix: "/api/v1",
    environment: routeEnvironment,
    services,
  });
  apps.push(app);

  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /api/v1/auth/me", () => {
  it("returns the authenticated user's safe profile and multiple roles", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: safeUserId,
      displayName: "Synthetic Student",
      email: "student@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student", "teacher"],
    });
    expect(services.currentUser.getCurrentUser).toHaveBeenCalledWith(
      safeUserId,
    );
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("sessionToken");
    expect(response.body).not.toContain(sessionToken);
  });

  it("returns HTTP 401 when authentication or the current identity is absent", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.currentUser.getCurrentUser).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:authentication-required",
      status: 401,
    });
  });
});

describe("identity login and logout routes", () => {
  const allowedOrigin = { origin: "http://localhost:5173" };

  it("logs in, sets a protected session cookie, and omits the token from JSON", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: allowedOrigin,
      payload: {
        email: "STUDENT@example.test",
        password: "a sufficiently long synthetic passphrase",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: safeUserId,
      displayName: "Synthetic Student",
      email: "student@example.test",
    });
    expect(response.body).not.toContain(sessionToken);
    expect(response.body).not.toContain("sessionToken");
    expect(response.headers["set-cookie"]).toContain("edutrack_session=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]).toContain("Path=/");
    expect(services.login.login).toHaveBeenCalledWith({
      email: "student@example.test",
      password: "a sufficiently long synthetic passphrase",
    });
  });

  it("uses a Secure __Host cookie in production", async () => {
    const { app } = await createRouteHarness({
      ...environment,
      NODE_ENV: "production",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: allowedOrigin,
      payload: {
        email: "student@example.test",
        password: "a sufficiently long synthetic passphrase",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain(
      "__Host-edutrack_session=",
    );
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("Path=/");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
  });

  it("returns a generic 401 Problem Details response for invalid credentials", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.login.login).mockRejectedValue(
      new InvalidCredentialsError(),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: allowedOrigin,
      payload: {
        email: "unknown@example.test",
        password: "a sufficiently long synthetic passphrase",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toEqual({
      type: "urn:edutrack:problem:invalid-credentials",
      title: "Authentication failed",
      status: 401,
      detail: "The email or password is incorrect.",
    });
    expect(response.body).not.toContain("unknown@example.test");
  });

  it("rejects invalid login input and cross-origin requests before login", async () => {
    const { app, services } = await createRouteHarness();
    const invalidBody = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: allowedOrigin,
      payload: { email: "not-an-email", password: "weak" },
    });
    const crossOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://attacker.example" },
      payload: {
        email: "student@example.test",
        password: "a sufficiently long synthetic passphrase",
      },
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(crossOrigin.statusCode).toBe(403);
    expect(services.login.login).not.toHaveBeenCalled();
  });

  it("revokes the cookie session and clears the cookie on logout", async () => {
    const { app, services } = await createRouteHarness();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        ...allowedOrigin,
        cookie: `edutrack_session=${sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Logged out." });
    expect(services.sessions.revokeSession).toHaveBeenCalledWith(sessionToken);
    expect(response.headers["set-cookie"]).toContain("edutrack_session=");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.body).not.toContain(sessionToken);
  });

  it("allows idempotent logout without a cookie and rejects a foreign Origin", async () => {
    const { app, services } = await createRouteHarness();
    const noCookie = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: allowedOrigin,
    });
    const crossOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin: "https://attacker.example" },
    });

    expect(noCookie.statusCode).toBe(200);
    expect(services.sessions.revokeSession).not.toHaveBeenCalled();
    expect(crossOrigin.statusCode).toBe(403);
    expect(services.sessions.revokeSession).not.toHaveBeenCalled();
  });
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
