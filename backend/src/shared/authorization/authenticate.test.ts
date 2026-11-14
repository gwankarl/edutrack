import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import {
  createAuthenticate,
  type AuthenticateDependencies,
} from "./authenticate.js";

import { requireRole } from "./require-role.js";
import { requireResourceAccess } from "./require-resource-access.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const token = "A".repeat(43);
const cookieName = "edutrack_session";

const environment: Pick<Environment, "NODE_ENV"> = {
  NODE_ENV: "test",
};

const activeSession = {
  id: "2a21a7aa-e5b2-4f96-a9b7-e45929c834d1",
  userId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-01-08T00:00:00.000Z"),
  revokedAt: null,
  lastActivityAt: new Date("2026-01-01T00:00:00.000Z"),
};

const activeUser = {
  id: userId,
  email: "student@example.test",
  displayName: "Synthetic Student",
  accountStatus: "active",
};

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(options?: {
  session: typeof activeSession | null;
  user: typeof activeUser | null;
}) {
  const app = Fastify({ logger: false });
  const sessionService = {
    validateSession: vi.fn(async () =>
      options ? options.session : activeSession,
    ),
    revokeSession: vi.fn(async () => true),
  };
  const identityRepository = {
    findUserById: vi.fn(async () => (options ? options.user : activeUser)),
    findRolesByUserId: vi.fn(async () => ["student" as const]),
  };

  const dependencies: AuthenticateDependencies = {
    environment,
    sessionService,
    identityRepository,
  };

  await app.register(cookie);

  app.get(
    "/private",
    { preHandler: createAuthenticate(dependencies) },
    async (request) => ({
      authContext: request.authContext,
    }),
  );

  // Demonstrates that public routes do not run the authentication pre-handler.
  app.get("/public", async () => ({ ok: true }));

  apps.push(app);
  return { app, sessionService, identityRepository };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("createAuthenticate", () => {
  it("validates the cookie session and attaches only safe identity fields", async () => {
    const { app, sessionService, identityRepository } = await createHarness();
    const response = await app.inject({
      method: "GET",
      url: "/private",
      headers: { cookie: `${cookieName}=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authContext: {
        userId,
        user: {
          id: userId,
          email: "student@example.test",
          displayName: "Synthetic Student",
        },
        roles: ["student"],
      },
    });
    expect(sessionService.validateSession).toHaveBeenCalledWith(token);
    expect(identityRepository.findUserById).toHaveBeenCalledWith(userId);
    expect(identityRepository.findRolesByUserId).toHaveBeenCalledWith(userId);
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("accountStatus");
  });

  it.each([
    ["missing cookie", undefined, activeUser],
    ["invalid or expired session", null, activeUser],
    ["missing user", activeSession, null],
    [
      "inactive user",
      activeSession,
      { ...activeUser, accountStatus: "disabled" },
    ],
  ])(
    "rejects a %s with generic 401 Problem Details",
    async (_label, session, user) => {
      const { app } = await createHarness({
        session: session as typeof activeSession | null,
        user: user as typeof activeUser | null,
      });

      const response = await app.inject({
        method: "GET",
        url: "/private",
        ...(session ? { headers: { cookie: `${cookieName}=${token}` } } : {}),
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(response.json()).toEqual({
        type: "urn:edutrack:problem:authentication-required",
        title: "Authentication required",
        status: 401,
        detail: "A valid session is required.",
      });
      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain("student@example.test");
    },
  );

  it("does not run authentication for a public route", async () => {
    const { app, sessionService, identityRepository } = await createHarness({
      session: null,
      user: null,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(sessionService.validateSession).not.toHaveBeenCalled();
    expect(identityRepository.findUserById).not.toHaveBeenCalled();
    expect(identityRepository.findRolesByUserId).not.toHaveBeenCalled();
  });

  it("composes authentication before role and resource guards", async () => {
    const app = Fastify({ logger: false });
    const sessionService = {
      validateSession: vi.fn(async () => activeSession),
      revokeSession: vi.fn(async () => true),
    };
    const identityRepository = {
      findUserById: vi.fn(async () => activeUser),
      findRolesByUserId: vi.fn(async () => ["teacher" as const]),
    };

    const resolveResource = vi.fn(async () => ({
      id: "synthetic-course-1",
      ownerId: userId,
    }));

    await app.register(cookie);

    app.get(
      "/protected",
      {
        preHandler: [
          createAuthenticate({
            environment,
            sessionService,
            identityRepository,
          }),
          requireRole("teacher"),
          requireResourceAccess({
            resolveResource,
            getOwnerId: (course) => course.ownerId,
          }),
        ],
      },
      async (request) => ({
        userId: request.authContext?.userId,
      }),
    );

    app.get(
      "/role-denied",
      {
        preHandler: [
          createAuthenticate({
            environment,
            sessionService: {
              validateSession: vi.fn(async () => activeSession),
              revokeSession: vi.fn(async () => true),
            },
            identityRepository: {
              findUserById: vi.fn(async () => activeUser),
              findRolesByUserId: vi.fn(async () => ["student" as const]),
            },
          }),
          requireRole("teacher"),
          requireResourceAccess({
            resolveResource,
            getOwnerId: (course) => course.ownerId,
          }),
        ],
      },
      async () => ({ ok: true }),
    );

    apps.push(app);

    const authenticated = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: `${cookieName}=${token}` },
    });

    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json()).toEqual({ userId });
    expect(resolveResource).toHaveBeenCalledTimes(1);

    const roleDenied = await app.inject({
      method: "GET",
      url: "/role-denied",
      headers: { cookie: `${cookieName}=${token}` },
    });

    expect(roleDenied.statusCode).toBe(403);
    expect(resolveResource).toHaveBeenCalledTimes(1);
  });
});
