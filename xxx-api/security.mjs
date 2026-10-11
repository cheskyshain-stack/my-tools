import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const KDF = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) throw new Error('Use a password of 14 to 256 characters.');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 32, KDF);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, expected] = stored.split(':');
  const actual = await derive(password, salt, 32, KDF);
  const bytes = Buffer.from(expected, 'hex');
  return bytes.length === actual.length && timingSafeEqual(actual, bytes);
}
