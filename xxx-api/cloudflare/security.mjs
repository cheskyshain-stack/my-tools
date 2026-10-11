import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ServiceError } from '../providers.mjs';
export { digest, token } from '../security.mjs';

// OWASP's equivalent 32 MiB scrypt profile fits Workers' 128 MiB isolate.
// At most two derivations run concurrently across the entire Worker isolate.
const derive = promisify(scrypt);
const KDF = { N:32768, r:8, p:3, maxmem:48*1024*1024 };
const prefix = 'scrypt$32768$8$3$';
let active = 0;
async function deriveBounded(password, salt) {
  if (active >= 2) throw new ServiceError(503, 'login_busy', 'Sign-in is busy. Try again shortly.');
  active++;
  try { return await derive(password, salt, 32, KDF); }
  finally { active--; }
}
// Public dummy record, never an account. Unknown users still perform a full KDF.
export const dummyHash = prefix + '00000000000000000000000000000000$' + '0'.repeat(64);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) throw new Error('Use a password of 14 to 256 characters.');
  const salt = randomBytes(16).toString('hex');
  return prefix + salt + '$' + (await deriveBounded(password, salt)).toString('hex');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256 || typeof stored !== 'string' || !stored.startsWith(prefix)) return false;
  const parts = stored.slice(prefix.length).split('$');
  if (parts.length !== 2 || !/^[a-f0-9]{32}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const actual = await deriveBounded(password, parts[0]);
  return timingSafeEqual(actual, Buffer.from(parts[1], 'hex'));
}
