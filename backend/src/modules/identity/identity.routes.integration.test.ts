import { createHash, randomUUID } from "node:crypto";

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
import { authSessions } from "../../infrastructure/database/schema/auth-sessions.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import { users } from "../../infrastructure/database/schema/users.js";
import { verificationTokens } from "../../infrastructure/database/schema/verification-tokens.js";

const sentEmailTexts: string[] = [];

const app = await createApp(loadEnvironment(), {
  emailTransportFactory: () => ({
    sendMail: vi.fn(async (message) => {
      sentEmailTexts.push(message.text);
    }),
  }),
});
const emailsToCleanUp: string[] = [];

function makeEmail(): string {
  return `route-${randomUUID()}@example.test`;
}

function getTokenFromLatestEmail(): string {
  const emailText = sentEmailTexts.at(-1);
  const link = emailText?.match(/https?:\/\/\S+/)?.[0];
  if (!link) {
    throw new Error("Expected a verification or reset link in mocked email.");
  }

  const token = new URL(link).searchParams.get("token");
  if (!token) {
    throw new Error("Expected a token in the mocked email link.");
  }

  return token;
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
    sentEmailTexts.length = 0;
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

  it("verifies an email through the API and consumes its token once", async () => {
    const email = makeEmail();
    emailsToCleanUp.push(email);

    const registration = await register(email);
    expect(registration.statusCode).toBe(201);
    const userId = registration.json<{ id: string }>().id;
    const token = getTokenFromLatestEmail();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Email verified." });
    expect(response.body).not.toContain(token);

    const [verifiedUser] = await app.db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId));
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [storedToken] = await app.db
      .select({ consumedAt: verificationTokens.consumedAt })
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash));

    expect(verifiedUser.emailVerifiedAt).toBeInstanceOf(Date);
    expect(storedToken.consumedAt).toBeInstanceOf(Date);

    const repeatedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    expect(repeatedResponse.statusCode).toBe(400);
    expect(repeatedResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(repeatedResponse.body).not.toContain(token);
  });

  it("returns the same forgot-password response for known and unknown emails", async () => {
    const email = makeEmail();
    emailsToCleanUp.push(email);
    await register(email);
    sentEmailTexts.length = 0;

    const knownResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email },
    });
    expect(sentEmailTexts).toHaveLength(1);

    const unknownResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: makeEmail() },
    });

    expect(knownResponse.statusCode).toBe(202);
    expect(unknownResponse.statusCode).toBe(knownResponse.statusCode);
    expect(unknownResponse.body).toBe(knownResponse.body);
    expect(knownResponse.json()).toEqual({
      message:
        "If an account exists for that email, a password reset link will be sent.",
    });
    expect(sentEmailTexts).toHaveLength(1);
    expect(knownResponse.body).not.toContain("token");
  });

  it("resets a password, consumes the token, and revokes existing sessions", async () => {
    const email = makeEmail();
    emailsToCleanUp.push(email);
    const registration = await register(email);
    const userId = registration.json<{ id: string }>().id;
    sentEmailTexts.length = 0;

    const forgotResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email },
    });
    expect(forgotResponse.statusCode).toBe(202);
    const token = getTokenFromLatestEmail();
    const sessionTokenHash = createHash("sha256")
      .update(randomUUID())
      .digest("hex");
    await app.db.insert(authSessions).values({
      userId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const newPassword = "synthetic replacement passphrase";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Password has been reset." });
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain(newPassword);
    expect(response.body).not.toContain("passwordHash");

    const [updatedUser] = await app.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    const [session] = await app.db
      .select({ revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.sessionTokenHash, sessionTokenHash));
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [storedToken] = await app.db
      .select({ consumedAt: verificationTokens.consumedAt })
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash));

    expect(updatedUser.passwordHash).toMatch(/^\$argon2id\$/);
    expect(updatedUser.passwordHash).not.toBe(newPassword);
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(storedToken.consumedAt).toBeInstanceOf(Date);

    const replayResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "another synthetic passphrase" },
    });
    expect(replayResponse.statusCode).toBe(400);
    expect(replayResponse.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(replayResponse.body).not.toContain(token);
  });
});
