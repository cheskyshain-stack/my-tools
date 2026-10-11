import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.mjs';
export { digest, token, hashPassword, verifyPassword } from './security.mjs';
import { licenseValues } from './license.mjs';
export { allowedLicense } from './license.mjs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
  const values = licenseValues(item);
  const existing = db.prepare('SELECT id FROM licenses WHERE provider_id=?').get(item.providerVideoId.toLowerCase());
  if (!existing && db.prepare('SELECT COUNT(*) AS count FROM licenses').get().count >= 500) throw new Error('This adapter supports at most 500 licensed titles.');
  const id = existing?.id || randomUUID();
  db.prepare(`INSERT INTO licenses VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reference=excluded.reference,category=excluded.category,starts=excluded.starts,ends=excluded.ends,countries=excluded.countries,full_length=excluded.full_length,native_hls=excluded.native_hls,drm_required=excluded.drm_required`).run(id, ...values);
  return id;
}

export function takeLimit(db, key, maximum, seconds, now = Date.now()) {
  const row = db.prepare('SELECT count,reset FROM limits WHERE key=?').get(key);
  if (row && row.reset > now && row.count >= maximum) return false;
  db.prepare(`INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END`).run(key, now + seconds * 1000, now, now);
  return true;
}
