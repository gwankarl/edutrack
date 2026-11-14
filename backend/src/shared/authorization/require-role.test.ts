import Fastify, { type preHandlerHookHandler } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthContext } from "./auth-context.js";
import { requireRole } from "./require-role.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";

const apps: Array<ReturnType<typeof Fastify>> = [];

function attachContext(context: AuthContext): preHandlerHookHandler {
  return async (request) => {
    request.authContext = context;
  };
}

async function createApp(
  requiredRoles: Parameters<typeof requireRole>,
  context?: AuthContext,
) {
  const app = Fastify({ logger: false });

  app.get(
    "/protected",
    {
      preHandler: [
        ...(context ? [attachContext(context)] : []),
        requireRole(...requiredRoles),
      ],
    },
    async () => ({ ok: true }),
  );

  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("requireRole", () => {
  it("allows a user who has the required role", async () => {
    const app = await createApp(["teacher"], {
      userId,
      user: {
        id: userId,
        email: "teacher@example.test",
        displayName: "Synthetic Teacher",
      },
      roles: ["teacher"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("allows access when one of several required roles matches", async () => {
    const app = await createApp(["teacher", "administrator"], {
      userId,
      user: {
        id: userId,
        email: "teacher@example.test",
        displayName: "Synthetic Teacher",
      },
      roles: ["student", "teacher"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(200);
  });

  it("returns 403 when an authenticated user lacks every required role", async () => {
    const app = await createApp(["administrator"], {
      userId,
      user: {
        id: userId,
        email: "student@example.test",
        displayName: "Synthetic Student",
      },
      roles: ["student", "teacher"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toEqual({
      type: "urn:edutrack:problem:forbidden",
      title: "Forbidden",
      status: 403,
      detail: "You do not have permission to access this resource.",
    });
  });

  it("returns 401 when authentication has not populated the request context", async () => {
    const app = await createApp(["teacher"]);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
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

  it("does not authorize based on a client-supplied role", async () => {
    const app = await createApp(["administrator"], {
      userId,
      user: {
        id: userId,
        email: "student@example.test",
        displayName: "Synthetic Student",
      },
      roles: ["student"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/protected?role=administrator",
      headers: { "x-user-role": "administrator" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a guard configured without required roles", () => {
    expect(() => requireRole()).toThrow(RangeError);
  });

  it.each(["student", "teacher", "administrator"] as const)(
    "allows a user with the %s role",
    async (role) => {
      const app = await createApp([role], {
        userId,
        user: {
          id: userId,
          email: "synthetic-user@example.test",
          displayName: "Synthetic User",
        },
        roles: [role],
      });

      const response = await app.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(200);
    },
  );
});
