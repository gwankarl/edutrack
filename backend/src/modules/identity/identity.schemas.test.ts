import { describe, expect, it } from "vitest";

import {
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  registrationRequestSchema,
  registrationResponseSchema,
} from "./identity.schemas.js";

describe("registrationRequestSchema", () => {
  it("trims the display name and normalizes the email", () => {
    const result = registrationRequestSchema.parse({
      displayName: "  Ada Gwanyama  ",
      email: "  ADA@example.test ",
      password: "a-long test passphrase",
    });

    expect(result).toEqual({
      displayName: "Ada Gwanyama",
      email: "ada@example.test",
      password: "a-long test passphrase",
    });
  });

  it("rejects a blank or overlong display name", () => {
    expect(
      registrationRequestSchema.safeParse({
        displayName: "   ",
        email: "ada@example.test",
        password: "a-long test passphrase",
      }).success,
    ).toBe(false);

    expect(
      registrationRequestSchema.safeParse({
        displayName: "a".repeat(121),
        email: "ada@example.test",
        password: "a-long test passphrase",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed or overlong emails", () => {
    for (const email of ["not-an-email", `${"a".repeat(245)}@example.test`]) {
      expect(
        registrationRequestSchema.safeParse({
          displayName: "Ada",
          email,
          password: "a-long test passphrase",
        }).success,
      ).toBe(false);
    }
  });

  it("enforces password length without trimming the password", () => {
    expect(
      registrationRequestSchema.safeParse({
        displayName: "Ada",
        email: "ada@example.test",
        password: "short",
      }).success,
    ).toBe(false);

    expect(
      registrationRequestSchema.safeParse({
        displayName: "Ada",
        email: "ada@example.test",
        password: "p".repeat(129),
      }).success,
    ).toBe(false);

    expect(
      registrationRequestSchema.parse({
        displayName: "Ada",
        email: "ada@example.test",
        password: "  twelve chars  ",
      }).password,
    ).toBe("  twelve chars  ");
  });

  it("rejects extra request fields", () => {
    expect(
      registrationRequestSchema.safeParse({
        displayName: "Ada",
        email: "ada@example.test",
        password: "a-long test passphrase",
        role: "administrator",
      }).success,
    ).toBe(false);
  });
});

describe("registrationResponseSchema", () => {
  it("accepts the safe public registration response", () => {
    expect(
      registrationResponseSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        displayName: "Ada Gwanyama",
        email: "ada@example.test",
      }),
    ).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      displayName: "Ada Gwanyama",
      email: "ada@example.test",
    });
  });

  it("rejects sensitive or unexpected response fields", () => {
    expect(
      registrationResponseSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        displayName: "Ada Gwanyama",
        email: "ada@example.test",
        passwordHash: "must-not-be-returned",
      }).success,
    ).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("normalizes email and preserves the password exactly", () => {
    expect(
      loginRequestSchema.parse({
        email: "  ADA@Example.Test ",
        password: "  a valid synthetic passphrase  ",
      }),
    ).toEqual({
      email: "ada@example.test",
      password: "  a valid synthetic passphrase  ",
    });
  });

  it("rejects malformed email and passwords outside registration limits", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "not-an-email",
        password: "a valid synthetic passphrase",
      }).success,
    ).toBe(false);

    expect(
      loginRequestSchema.safeParse({
        email: "ada@example.test",
        password: "short",
      }).success,
    ).toBe(false);

    expect(
      loginRequestSchema.safeParse({
        email: "ada@example.test",
        password: "p".repeat(129),
      }).success,
    ).toBe(false);
  });

  it("rejects unexpected request fields", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "ada@example.test",
        password: "a valid synthetic passphrase",
        sessionToken: "must-not-be-accepted",
      }).success,
    ).toBe(false);
  });
});

describe("loginResponseSchema", () => {
  it("accepts the safe shared user profile", () => {
    expect(
      loginResponseSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        displayName: "Ada Gwanyama",
        email: "ada@example.test",
      }),
    ).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      displayName: "Ada Gwanyama",
      email: "ada@example.test",
    });
  });

  it("rejects password, password hash, and session token fields", () => {
    const response = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      displayName: "Ada Gwanyama",
      email: "ada@example.test",
    };

    for (const sensitiveFields of [
      { password: "synthetic-password" },
      { passwordHash: "$argon2id$synthetic-hash" },
      { sessionToken: "synthetic-session-token" },
    ]) {
      expect(
        loginResponseSchema.safeParse({
          ...response,
          ...sensitiveFields,
        }).success,
      ).toBe(false);
    }
  });
});

describe("logoutResponseSchema", () => {
  it("accepts only the fixed logout message", () => {
    expect(logoutResponseSchema.parse({ message: "Logged out." })).toEqual({
      message: "Logged out.",
    });

    expect(
      logoutResponseSchema.safeParse({
        message: "Logged out.",
        sessionToken: "must-not-be-returned",
      }).success,
    ).toBe(false);
  });
});
