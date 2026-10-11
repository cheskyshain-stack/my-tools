import { createApplication } from '../application.mjs';
import { readConfig } from '../config.mjs';
import * as security from './security.mjs';
import { d1Store } from './d1-store.mjs';
import { bunnyAdapter, yotiAdapter } from '../providers.mjs';

// Retain the bounded 30-second provider metadata cache across requests. Each
// request still has its own D1 session and checks current account/license rights.
const providers = new WeakMap();

function unavailable() {
  return Response.json({ code:'api_unavailable', message:'Sign-in is temporarily unavailable.' }, { status:503, headers:{ 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
}

export default {
  async fetch(request, env) {
    try {
      // No production local-mode override, preview URL or alternate hostname.
      const config = readConfig({ ...env, PORTAL_LOCAL:'false' });
      if (new URL(request.url).origin !== config.apiOrigin || !env.DB) return unavailable();
      const db = d1Store(env.DB);
      const version = await db.prepare('SELECT version FROM schema_version WHERE id=1').get();
      if (version?.version !== 1) return unavailable();
      let adapters = providers.get(env);
      if (!adapters) { adapters = { bunny:bunnyAdapter(config),yoti:yotiAdapter(config) }; providers.set(env,adapters); }
      const handler = await createApplication(config, { db, security, adapters,
        clientIp: req => req.headers['cf-connecting-ip'] || 'unknown'
      });
      const incoming = {
        url:request.url, method:request.method,
        headers:Object.fromEntries(request.headers), socket:{ remoteAddress:'cloudflare' },
        async *[Symbol.asyncIterator]() { if (request.body) yield* request.body; }
      };
      let status = 200, payload;
      const headers = new Headers({ 'Strict-Transport-Security':'max-age=31536000' });
      const outgoing = {
        headersSent:false,
        setHeader: (key,value) => headers.set(key,value),
        writeHead(code, extra) { status = code; for (const [key,value] of Object.entries(extra)) headers.set(key,value); this.headersSent = true; },
        end(value) { payload = value; }
      };
      await handler(incoming,outgoing);
      return new Response(status === 204 ? null : payload, { status,headers });
    } catch {
      // D1 and runtime failures never expose SQL, account data, or secrets.
      return unavailable();
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(Date.now()),
      env.DB.prepare('DELETE FROM limits WHERE reset<=?').bind(Date.now())
    ]).catch(() => {}));
  }
};
