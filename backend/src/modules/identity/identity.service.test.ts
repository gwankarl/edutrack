import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  DuplicateEmailError,
  type CreateIdentityUserInput,
  type IdentityUser,
} from "./identity.repository.js";
import { createIdentityService } from "./identity.service.js";

const safeUserId = "550e8400-e29b-41d4-a716-446655440000";

describe("identity registration service", () => {
  it("validates, hashes, creates a student user, and returns only safe fields", async () => {
    const hashPassword = vi.fn(async () => "$argon2id$synthetic-hash");

    const createUser = vi.fn(
      async (input: CreateIdentityUserInput): Promise<IdentityUser> => ({
        id: safeUserId,
        email: input.email,
        displayName: input.displayName,
      }),
    );
    const emailVerificationService = {
      sendVerificationEmail: vi.fn(async () => {}),
    };

    const service = createIdentityService({
      repository: {
        createUser,
        findCurrentUserById: vi.fn(async () => null),
        findRolesByUserId: vi.fn(async () => []),
      },
      hashPassword,
      emailVerificationService,
    });

    const response = await service.register({
      displayName: "  Ada Gwanyama  ",
      email: "  ADA@example.test ",
      password: "a valid synthetic passphrase",
    });

    expect(hashPassword).toHaveBeenCalledWith("a valid synthetic passphrase");
    expect(createUser).toHaveBeenCalledWith({
      email: "ada@example.test",
      displayName: "Ada Gwanyama",
      passwordHash: "$argon2id$synthetic-hash",
    });
    expect(emailVerificationService.sendVerificationEmail).toHaveBeenCalledWith(
      {
        id: safeUserId,
        email: "ada@example.test",
      },
    );
    expect(response).toEqual({
      id: safeUserId,
      email: "ada@example.test",
      displayName: "Ada Gwanyama",
    });
    expect(response).not.toHaveProperty("passwordHash");
    expect(response).not.toHaveProperty("password");
  });

  it("rejects invalid input before hashing or creating a user", async () => {
    const hashPassword = vi.fn(async () => "$argon2id$synthetic-hash");
    const createUser = vi.fn(
      async (input: CreateIdentityUserInput): Promise<IdentityUser> => ({
        id: safeUserId,
        email: input.email,
        displayName: input.displayName,
      }),
    );
    const emailVerificationService = {
      sendVerificationEmail: vi.fn(async () => {}),
    };

    const service = createIdentityService({
      repository: {
        createUser,
        findCurrentUserById: vi.fn(async () => null),
        findRolesByUserId: vi.fn(async () => []),
      },
      hashPassword,
      emailVerificationService,
    });

    await expect(
      service.register({
        displayName: "Ada",
        email: "not-an-email",
        password: "short",
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(hashPassword).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(
      emailVerificationService.sendVerificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("passes duplicate-email errors through for the route to map to HTTP 409", async () => {
    const duplicateEmailError = new DuplicateEmailError();
    const hashPassword = vi.fn(async () => "$argon2id$synthetic-hash");
    const createUser = vi.fn(async (): Promise<IdentityUser> => {
      throw duplicateEmailError;
    });
    const emailVerificationService = {
      sendVerificationEmail: vi.fn(async () => {}),
    };

    const service = createIdentityService({
      repository: {
        createUser,
        findCurrentUserById: vi.fn(async () => null),
        findRolesByUserId: vi.fn(async () => []),
      },
      hashPassword,
      emailVerificationService,
    });

    await expect(
      service.register({
        displayName: "Ada",
        email: "ada@example.test",
        password: "a valid synthetic passphrase",
      }),
    ).rejects.toBe(duplicateEmailError);
    expect(
      emailVerificationService.sendVerificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("propagates verification delivery failure without returning registration data", async () => {
    const emailVerificationService = {
      sendVerificationEmail: vi.fn(async () => {
        throw new Error("Email delivery failed.");
      }),
    };
    const service = createIdentityService({
      repository: {
        createUser: vi.fn(async (input: CreateIdentityUserInput) => ({
          id: safeUserId,
          email: input.email,
          displayName: input.displayName,
        })),
        findCurrentUserById: vi.fn(async () => null),
        findRolesByUserId: vi.fn(async () => []),
      },
      hashPassword: vi.fn(async () => "$argon2id$synthetic-hash"),
      emailVerificationService,
    });

    await expect(
      service.register({
        displayName: "Ada",
        email: "ada@example.test",
        password: "a valid synthetic passphrase",
      }),
    ).rejects.toThrow("Email delivery failed.");
  });
});

describe("current-user identity service", () => {
  it("returns safe current-user data with every assigned role", async () => {
    const repository = {
      createUser: vi.fn(),
      findCurrentUserById: vi.fn(async () => ({
        id: safeUserId,
        email: "student@example.test",
        displayName: "Synthetic Student",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        accountStatus: "active",
      })),
      findRolesByUserId: vi.fn(
        async () => ["student", "teacher"] as ["student", "teacher"],
      ),
    };
    const service = createIdentityService({
      repository,
      hashPassword: vi.fn(),
      emailVerificationService: { sendVerificationEmail: vi.fn() },
    });

    const result = await service.getCurrentUser(safeUserId);

    expect(result).toEqual({
      id: safeUserId,
      email: "student@example.test",
      displayName: "Synthetic Student",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student", "teacher"],
    });
    expect(repository.findCurrentUserById).toHaveBeenCalledWith(safeUserId);
    expect(repository.findRolesByUserId).toHaveBeenCalledWith(safeUserId);
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("sessionToken");
  });

  it("reports an unverified email without exposing the verification timestamp", async () => {
    const repository = {
      createUser: vi.fn(),
      findCurrentUserById: vi.fn(async () => ({
        id: safeUserId,
        email: "student@example.test",
        displayName: "Synthetic Student",
        emailVerifiedAt: null,
        accountStatus: "active",
      })),
      findRolesByUserId: vi.fn(async () => ["student"] as ["student"]),
    };
    const service = createIdentityService({
      repository,
      hashPassword: vi.fn(),
      emailVerificationService: { sendVerificationEmail: vi.fn() },
    });

    await expect(service.getCurrentUser(safeUserId)).resolves.toMatchObject({
      emailVerified: false,
      roles: ["student"],
    });
  });

  it("returns null when the identity no longer exists", async () => {
    const repository = {
      createUser: vi.fn(),
      findCurrentUserById: vi.fn(async () => null),
      findRolesByUserId: vi.fn(),
    };
    const service = createIdentityService({
      repository,
      hashPassword: vi.fn(),
      emailVerificationService: { sendVerificationEmail: vi.fn() },
    });

    await expect(service.getCurrentUser(safeUserId)).resolves.toBeNull();
    expect(repository.findRolesByUserId).not.toHaveBeenCalled();
  });
});
