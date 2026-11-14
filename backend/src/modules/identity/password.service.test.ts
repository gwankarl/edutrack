import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.service.js";

describe("password service", () => {
  it("hashes passwords with the configured Argon2id parameters", async () => {
    const password = "synthetic test passphrase";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const passwordHash = await hashPassword("correct test passphrase");

    await expect(
      verifyPassword("incorrect test passphrase", passwordHash),
    ).resolves.toBe(false);
  });

  it("generates unique hashes for the same password", async () => {
    const password = "same synthetic passphrase";

    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(verifyPassword(password, secondHash)).resolves.toBe(true);
  });

  it("returns false for a malformed stored hash", async () => {
    await expect(
      verifyPassword("synthetic test passphrase", "not-a-valid-hash"),
    ).resolves.toBe(false);
  });
});
