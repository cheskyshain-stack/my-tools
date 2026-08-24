/*
 * Money Flow sync.
 *
 * This holds one blob per vault and knows nothing about what is in it. The
 * browser encrypts the ledger before it leaves and decrypts it on the way
 * back, so a dump of this KV namespace is a pile of noise: no dates, no
 * payees, no dollar figures.
 *
 * What it does store, per vault:
 *   salt      the KDF salt, useless on its own
 *   wrapped   the data key, sealed twice over, once by the passphrase and
 *             once by the recovery code. Either one opens it, neither is here.
 *   blob      the ledger, sealed by that data key
 *   version   a counter, bumped on every accepted write
 *
 * Writes carry If-Match with the version they were based on. A stale write is
 * refused with 409 and the current copy, so the browser can merge and retry
 * rather than flatten whatever the other device did.
 *
 * This must live on its own hostname. Never put a Worker in front of
 * tools.cjaffa.com: doing that once took the whole site down for a day.
 */

const ALLOWED_ORIGINS = [
  "https://tools.cjaffa.com",
  "http://127.0.0.1:8080",          // local testing, harmless: it holds no secrets
  "http://localhost:8080"
];

const MAX_BODY = 4 * 1024 * 1024;   // a ledger of this size would be decades of entries
const ID = /^[0-9a-f]{32}$/;

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,If-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" },
                           cors(origin), extra || {})
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1\/vault\/([^/]+)$/);
    if (!m) { return json({ error: "no such endpoint" }, 404, origin); }

    const id = m[1];
    if (!ID.test(id)) { return json({ error: "bad vault id" }, 400, origin); }

    if (request.method === "GET") {
      const raw = await env.VAULT.get("v:" + id);
      if (!raw) { return json({ error: "no vault there" }, 404, origin); }
      const rec = JSON.parse(raw);
      return json(rec, 200, origin, { ETag: '"' + rec.version + '"' });
    }

    if (request.method === "PUT") {
      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > MAX_BODY) { return json({ error: "too big" }, 413, origin); }

      let body;
      try { body = await request.json(); }
      catch (e) { return json({ error: "not json" }, 400, origin); }

      if (typeof body.blob !== "string" || typeof body.salt !== "string" ||
          !body.wrapped || typeof body.wrapped !== "object") {
        return json({ error: "missing salt, wrapped or blob" }, 400, origin);
      }
      if (body.blob.length > MAX_BODY) { return json({ error: "too big" }, 413, origin); }

      const key = "v:" + id;
      const raw = await env.VAULT.get(key);
      const current = raw ? JSON.parse(raw) : null;
      const want = (request.headers.get("If-Match") || "").replace(/"/g, "");

      // "*" means create, and only create. Anything else has to name the
      // version it was working from.
      if (want === "*") {
        if (current) { return json({ error: "already there", current: current }, 409, origin); }
      } else {
        const based = Number(want);
        if (!current) { return json({ error: "no vault there" }, 404, origin); }
        if (!isFinite(based) || based !== current.version) {
          return json({ error: "someone else wrote first", current: current }, 409, origin);
        }
      }

      const next = {
        version: current ? current.version + 1 : 1,
        salt: body.salt,
        wrapped: body.wrapped,
        blob: body.blob,
        updatedAt: new Date().toISOString(),
        // Just enough to tell the user which device wrote last. Free text from
        // the browser, so it is shown escaped and trusted for nothing else.
        by: typeof body.by === "string" ? body.by.slice(0, 40) : ""
      };
      await env.VAULT.put(key, JSON.stringify(next));
      return json({ version: next.version, updatedAt: next.updatedAt }, 200, origin,
                  { ETag: '"' + next.version + '"' });
    }

    return json({ error: "method not allowed" }, 405, origin);
  }
};
