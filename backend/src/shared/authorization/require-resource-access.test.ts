import Fastify, { type preHandlerHookHandler } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthContext } from "./auth-context.js";
import {
  requireResourceAccess,
  type ResourceAccessPolicy,
} from "./require-resource-access.js";

interface SyntheticResource {
  id: string;
  ownerId: string;
  grantedUserIds: string[];
}

const ownerId = "550e8400-e29b-41d4-a716-446655440001";
const otherUserId = "550e8400-e29b-41d4-a716-446655440002";
const administratorId = "550e8400-e29b-41d4-a716-446655440003";

const resource: SyntheticResource = {
  id: "synthetic-resource-1",
  ownerId,
  grantedUserIds: [otherUserId],
};

function makeAuthContext(
  userId: string,
  roles: AuthContext["roles"] = ["student"],
): AuthContext {
  return {
    userId,
    user: {
      id: userId,
      email: "synthetic-user@example.test",
      displayName: "Synthetic User",
    },
    roles,
  };
}

function attachContext(context: AuthContext): preHandlerHookHandler {
  return async (request) => {
    request.authContext = context;
  };
}

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(
  policy: ResourceAccessPolicy<SyntheticResource>,
  context?: AuthContext,
) {
  const app = Fastify({ logger: false });

  app.get(
    "/resources/:resourceId",
    {
      preHandler: [
        ...(context ? [attachContext(context)] : []),
        requireResourceAccess(policy),
      ],
    },
    async () => ({ ok: true }),
  );

  apps.push(app);
  return app;
}

function makePolicy(
  overrides: Partial<ResourceAccessPolicy<SyntheticResource>> = {},
): ResourceAccessPolicy<SyntheticResource> {
  return {
    resolveResource: vi.fn(async () => resource),
    getOwnerId: (resolvedResource) => resolvedResource.ownerId,
    hasPermission: (resolvedResource, authContext) =>
      resolvedResource.grantedUserIds.includes(authContext.userId),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("requireResourceAccess", () => {
  it("allows the resource owner", async () => {
    const policy = makePolicy();
    const app = await createHarness(policy, makeAuthContext(ownerId));

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(200);
    expect(policy.resolveResource).toHaveBeenCalled();
  });

  it("allows a user with an explicitly granted permission", async () => {
    const app = await createHarness(makePolicy(), makeAuthContext(otherUserId));

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(200);
  });

  it("denies access when the user is neither owner nor permitted", async () => {
    const app = await createHarness(
      makePolicy(),
      makeAuthContext(administratorId, ["administrator"]),
    );

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:forbidden",
      status: 403,
    });
  });

  it("allows an administrator only when the policy explicitly opts in", async () => {
    const app = await createHarness(
      makePolicy({ allowAdministrator: true }),
      makeAuthContext(administratorId, ["administrator"]),
    );

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(200);
  });

  it("returns 401 when the request has no trusted authentication context", async () => {
    const app = await createHarness(makePolicy());

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
  });

  it("returns 404 when no resource exists", async () => {
    const app = await createHarness(
      makePolicy({ resolveResource: vi.fn(async () => null) }),
      makeAuthContext(ownerId),
    );

    const response = await app.inject({
      method: "GET",
      url: "/resources/missing-resource",
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
  });

  it("can conceal a resource by returning 404 on denied access", async () => {
    const app = await createHarness(
      makePolicy({ concealExistence: true }),
      makeAuthContext(administratorId, ["administrator"]),
    );

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:not-found",
      status: 404,
    });
  });

  it("does not trust owner or role values supplied by the client", async () => {
    const app = await createHarness(
      makePolicy(),
      makeAuthContext(administratorId, ["student"]),
    );

    const response = await app.inject({
      method: "GET",
      url: "/resources/synthetic-resource-1?ownerId=" + administratorId,
      headers: {
        "x-user-id": ownerId,
        "x-user-role": "administrator",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
