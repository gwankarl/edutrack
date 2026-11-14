import * as argon2 from "argon2";

const argon2Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  version: 0x13,
} satisfies argon2.HashOptions;

/** Hashes a password as an Argon2id PHC string for storage. */
export async function hashPassword(password: string): Promise<string> {
  // The library generates a unique random salt when none is supplied.
  return argon2.hash(password, {
    ...argon2Options,
    raw: false,
  });
}

/**
 * Verifies a password without exposing malformed-hash or library errors.
 * Returns false when verification cannot be completed.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
