import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createApp } from "../../app/create-app.js";
import { loadEnvironment } from "../../infrastructure/config/env.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import { users } from "../../infrastructure/database/schema/users.js";

const app = await createApp(loadEnvironment(), {
  emailTransportFactory: () => ({ sendMail: vi.fn(async () => undefined) }),
});
const emailsToCleanUp: string[] = [];

function makeEmail(): string {
  return `route-${randomUUID()}@example.test`;
}

async function register(email: string, password = "synthetic test passphrase") {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      displayName: "Integration Test Student",
      email,
      password,
    },
  });
}

describe("POST /api/v1/auth/register", () => {
  beforeAll(async () => {
    const result = await app.db.execute<{ database_name: string }>(
      `SELECT current_database() AS database_name`,
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error("Registration route tests may only use edutrack_test.");
    }
  });

  afterEach(async () => {
    if (emailsToCleanUp.length > 0) {
      await app.db
        .delete(users)
        .where(inArray(users.email, emailsToCleanUp.splice(0)));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a user with HTTP 201 and returns no sensitive fields", async () => {
    const email = makeEmail();
    const password = "synthetic test passphrase";
    emailsToCleanUp.push(email);

    const response = await register(email, password);
    const body = response.json();

    expect(response.statusCode).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      displayName: "Integration Test Student",
      email,
    });
    expect(response.body).not.toContain(password);
    expect(response.body).not.toContain("$argon2id$");
    expect(body).not.toHaveProperty("passwordHash");

    const [storedUser] = await app.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email));

    expect(storedUser.passwordHash).toMatch(/^\$argon2id\$/);

    const assignedRoles = await app.db
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, body.id));

    expect(assignedRoles.map(({ role }) => role)).toEqual(["student"]);
  });

  it("returns HTTP 400 Problem Details for invalid input", async () => {
    const password = "sensitive invalid password";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        displayName: " ",
        email: "not-an-email",
        password,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      title: "Invalid registration request",
      status: 400,
      detail: "The registration request is invalid.",
      errors: expect.any(Array),
    });
    expect(response.body).not.toContain(password);
  });

  it("returns HTTP 409 Problem Details for a duplicate email", async () => {
    const email = makeEmail();
    const password = "synthetic test passphrase";
    emailsToCleanUp.push(email);

    const firstResponse = await register(email, password);
    expect(firstResponse.statusCode).toBe(201);

    const duplicateResponse = await register(email.toUpperCase(), password);

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(duplicateResponse.json()).toEqual({
      type: "urn:edutrack:problem:registration-conflict",
      title: "Registration conflict",
      status: 409,
      detail: "Registration could not be completed.",
    });
    expect(duplicateResponse.body).not.toContain(password);
    expect(duplicateResponse.body).not.toContain("$argon2id$");
  });
});
