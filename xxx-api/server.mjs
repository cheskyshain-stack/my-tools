import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import * as security from './security.mjs';
import { readConfig as parseConfig } from './config.mjs';
import { createApplication } from './application.mjs';

export function readConfig(env = process.env) {
  const config = parseConfig(env);
  config.dbPath ||= fileURLToPath(new URL('./private/portal.sqlite', import.meta.url));
  return config;
}

export async function createPortal(config, { db = openStore(config.dbPath), fetcher = fetch } = {}) {
  const handler = await createApplication(config, { db, fetcher, security });
  const server = http.createServer(handler);
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  const cleanup = setInterval(() => { db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now()); db.prepare('DELETE FROM limits WHERE reset<=?').run(Date.now()); }, 60000).unref();
  server.on('close', () => clearInterval(cleanup));
  return { server, db };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = readConfig();
  const { server, db } = await createPortal(config);
  server.listen(Number(process.env.PORT || 8787), '127.0.0.1', () => console.log('Private portal API listening on loopback.'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
