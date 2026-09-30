import argon2 from 'argon2';

/** argon2id with OWASP-recommended baseline parameters. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain) {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function needsRehash(hash) {
  return argon2.needsRehash(hash, OPTIONS);
}

// Verified against when the email is unknown, so response time does not reveal
// whether an account exists.
let dummyHashPromise;
export function dummyHash() {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing-equalization');
  return dummyHashPromise;
}
