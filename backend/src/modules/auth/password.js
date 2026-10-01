import { hash, verify } from '@node-rs/argon2';

/** argon2id with OWASP-recommended baseline parameters. */
const ARGON2ID = 2; // @node-rs/argon2 Algorithm.Argon2id (const enum, so use the value)
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain) {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash, plain) {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

export function needsRehash(storedHash) {
  const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
  if (!match) return true;
  const [, m, t, p] = match.map(Number);
  return m !== OPTIONS.memoryCost || t !== OPTIONS.timeCost || p !== OPTIONS.parallelism;
}

// Verified against when the email is unknown, so response time does not reveal
// whether an account exists.
let dummyHashPromise;
export function dummyHash() {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing-equalization');
  return dummyHashPromise;
}
