import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (db.prepare('PRAGMA user_version').get().user_version > 1) { db.close(); throw new Error('This database requires a newer server.'); }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL, age_until INTEGER NOT NULL DEFAULT 0, age_id TEXT, age_ref TEXT, age_deadline INTEGER, age_checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY, provider_id TEXT NOT NULL UNIQUE, reference TEXT NOT NULL, category TEXT NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, countries TEXT NOT NULL, full_length INTEGER NOT NULL, native_hls INTEGER NOT NULL, drm_required INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS favorites(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE, added INTEGER NOT NULL, PRIMARY KEY(user_id,video_id));
    CREATE TABLE IF NOT EXISTS history(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE, position REAL NOT NULL, watched INTEGER NOT NULL, PRIMARY KEY(user_id,video_id));
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  return db;
}

export async function createUser(db, username, password) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new Error('Usernames use 3 to 64 lowercase letters, numbers, dots, underscores or hyphens.');
  db.prepare('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)').run(randomUUID(), username, await hashPassword(password));
}

export function importLicense(db, item) {
  if (!item || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.providerVideoId || '')) throw new Error('A Bunny video UUID is required.');
  const starts = Date.parse(item.startsAt), ends = Date.parse(item.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new Error('Explicit, valid license dates are required.');
  if (typeof item.licenseReference !== 'string' || item.licenseReference.length < 3 || item.licenseReference.length > 200) throw new Error('A license evidence reference is required.');
  if (typeof item.category !== 'string' || !item.category.trim() || item.category.length > 60) throw new Error('A category of up to 60 characters is required.');
  if (!Array.isArray(item.countries) || !item.countries.length || item.countries.length > 250 || item.countries.some(c => c !== '*' && !/^[A-Z]{2}$/.test(c)) || (item.countries.includes('*') && item.countries.length !== 1)) throw new Error('Use ISO country codes, or ["*"] for documented worldwide rights.');
  if (typeof item.fullLengthAuthorized !== 'boolean' || typeof item.nativeHlsAuthorized !== 'boolean' || typeof item.drmRequired !== 'boolean') throw new Error('Explicit full-length, native-HLS and DRM declarations are required.');
  const existing = db.prepare('SELECT id FROM licenses WHERE provider_id=?').get(item.providerVideoId.toLowerCase());
  if (!existing && db.prepare('SELECT COUNT(*) AS count FROM licenses').get().count >= 500) throw new Error('This adapter supports at most 500 licensed titles.');
  const id = existing?.id || randomUUID();
  db.prepare(`INSERT INTO licenses VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reference=excluded.reference,category=excluded.category,starts=excluded.starts,ends=excluded.ends,countries=excluded.countries,full_length=excluded.full_length,native_hls=excluded.native_hls,drm_required=excluded.drm_required`).run(id, item.providerVideoId.toLowerCase(), item.licenseReference, item.category.trim(), starts, ends, JSON.stringify([...new Set(item.countries)]), Number(item.fullLengthAuthorized), Number(item.nativeHlsAuthorized), Number(item.drmRequired));
  return id;
}

export function allowedLicense(row, now = Date.now()) {
  // This adapter supports worldwide rights only. Regional rights stay closed until
  // a trusted geolocation/entitlement adapter exists; a browser country is not proof.
  return !!row && row.starts <= now && row.ends > now && row.full_length === 1 && row.native_hls === 1 && row.drm_required === 0 && row.countries === '["*"]';
}

export function takeLimit(db, key, maximum, seconds, now = Date.now()) {
  const row = db.prepare('SELECT count,reset FROM limits WHERE key=?').get(key);
  if (row && row.reset > now && row.count >= maximum) return false;
  db.prepare(`INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END`).run(key, now + seconds * 1000, now, now);
  return true;
}
