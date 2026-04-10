import argon2 from "argon2";

// Matches the current OWASP baseline for Argon2id while staying within the
// app's interactive latency budget on the production hardware profile.
const ARGON2_OPTIONS: argon2.Options & { type: typeof argon2.argon2id } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password, ARGON2_OPTIONS);
}
