import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore, digest, token, hashPassword, verifyPassword, takeLimit, allowedLicense } from './store.mjs';
import { bunnyAdapter, yotiAdapter, ServiceError } from './providers.mjs';

export function readConfig(env = process.env) {
  const local = env.PORTAL_LOCAL === 'true';
  const portalOrigin = env.PORTAL_ORIGIN || 'https://tools.cjaffa.com';
  const apiOrigin = env.API_ORIGIN || '';
  for (const origin of [portalOrigin, apiOrigin]) {
    if (!origin) throw new Error('PORTAL_ORIGIN and API_ORIGIN are required.');
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || (!local && url.protocol !== 'https:') || (local && !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Invalid server origins. Local mode permits loopback only.');
  }
  if (!local && (portalOrigin !== 'https://tools.cjaffa.com' || new URL(apiOrigin).hostname === 'tools.cjaffa.com' || new URL(apiOrigin).hostname.split('.').slice(-2).join('.') !== 'cjaffa.com')) throw new Error('Use a separate same-site API hostname under cjaffa.com. Never replace the GitHub Pages hostname.');
  const minimumAge = Number(env.MINIMUM_AGE || 18);
  if (!Number.isInteger(minimumAge) || minimumAge < 18 || minimumAge > 100) throw new Error('MINIMUM_AGE must be at least 18.');
  return { local, portalOrigin, apiOrigin, minimumAge, dbPath: env.PORTAL_DB || fileURLToPath(new URL('./private/portal.sqlite',import.meta.url)), bunnyKey: env.BUNNY_API_KEY || '', bunnyTokenKey: env.BUNNY_TOKEN_KEY || '', bunnyLibrary: env.BUNNY_LIBRARY_ID || '', bunnyHost: env.BUNNY_CDN_HOST || '', bunnyApproved: env.BUNNY_CUSTOM_HLS_APPROVED === 'true', yotiKey: env.YOTI_API_KEY || '', yotiSdk: env.YOTI_SDK_ID || '' };
}

export async function createPortal(config, { db = openStore(config.dbPath), fetcher = fetch } = {}) {
  const bunny = bunnyAdapter(config, fetcher), yoti = yotiAdapter(config, fetcher);
  const cookieName = config.local ? 'cjxxx_local' : '__Host-cjxxx';
  const dummy = await hashPassword(token());
  let passwordChecks = 0;
  const fail = (status, code, message) => { throw new ServiceError(status, code, message); };
  function send(response, status, body, extra = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...extra });
    response.end(JSON.stringify(body));
  }
  function setCookie(value, seconds) {
    return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${config.local ? '' : '; Secure'}`;
  }
  async function body(request) {
    if ((request.headers['content-type'] || '').split(';')[0] !== 'application/json') fail(415, 'json_required', 'Send JSON for this request.');
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 16384) fail(413, 'body_too_large', 'This request is too large.'); chunks.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { fail(400, 'invalid_json', 'This request is invalid.'); }
  }
  function session(request) {
    const cookies = (request.headers.cookie || '').split(';').map(c => c.trim());
    const values = cookies.filter(c => c.startsWith(cookieName + '='));
    if (values.length !== 1) return null;
    const value = values[0].slice(cookieName.length + 1);
    if (!/^[a-zA-Z0-9_-]{43}$/.test(value)) return null;
    return db.prepare(`SELECT sessions.*,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>? AND users.enabled=1`).get(digest(value), Date.now()) || null;
  }
  function requireSession(request, age = false) {
    const row = session(request);
    if (!row) fail(401, 'sign_in_required', 'Please sign in again.');
    if (request.method !== 'GET' && request.headers['x-csrf-token'] !== row.csrf) fail(403, 'csrf_invalid', 'Please reload the page and try again.');
    if (age && row.age_until <= Date.now()) fail(403, 'age_required', 'Verify your age before opening the library.');
    return row;
  }
  function entitled(id) {
    const row = db.prepare('SELECT * FROM licenses WHERE id=?').get(id);
    if (!allowedLicense(row)) fail(404, 'video_unavailable', 'This video is unavailable.');
    return row;
  }
  function expires(row, license, seconds) {
    return Math.floor(Math.min(Date.now() + seconds * 1000, row.expires, row.age_until, license.ends) / 1000);
  }
  function limit(key, maximum, seconds) {
    if (!takeLimit(db, key, maximum, seconds)) fail(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  async function handler(request, response) {
    try {
      const url = new URL(request.url, config.apiOrigin), path = url.pathname;
      const origin = request.headers.origin;
      if (path === '/healthz' && request.method === 'GET') return send(response, 200, { ok: true });
      // CORS is not authentication. Origin is checked separately, and every
      // protected route also requires a server session and age grant.
      if (origin !== config.portalOrigin) fail(403, 'origin_denied', 'This origin is not allowed.');
      response.setHeader('Access-Control-Allow-Origin', config.portalOrigin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token', 'Access-Control-Max-Age': '600' }); return response.end();
      }
      // Caddy forwards requests from loopback. Its remote host header is stamped
      // by our provided config, never accepted on a directly reachable listener.
      const peer = request.socket.remoteAddress || 'unknown';
      const ip = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ? (request.headers['x-portal-client-ip'] || peer) : peer;
      limit('ip:' + digest(String(ip)), 300, 60);
      if (path === '/api/session' && request.method === 'GET') {
        const row = session(request);
        return send(response, 200, row ? { authenticated: true, username: row.username, csrf: row.csrf, ageVerified: row.age_until > Date.now(), ageExpiresAt: row.age_until, ageEnabled: yoti.configured, catalogConfigured: bunny.configured, minimumAge: config.minimumAge } : { authenticated: false });
      }
      if (path === '/api/login' && request.method === 'POST') {
        const data = await body(request);
        if (typeof data.username !== 'string' || typeof data.password !== 'string' || data.username.length > 64 || data.password.length > 256) fail(400, 'invalid_login', 'Enter your username and password.');
        limit('login-ip:' + digest(String(ip)), 10, 900);
        const username = data.username.trim().toLowerCase();
        limit('login-user:' + digest(username), 8, 900);
        if (passwordChecks >= 2) fail(503, 'login_busy', 'Sign-in is busy. Try again shortly.');
        const user = db.prepare('SELECT * FROM users WHERE username=? AND enabled=1').get(username);
        let valid; passwordChecks++;
        try { valid = await verifyPassword(data.password, user?.password_hash || dummy); } finally { passwordChecks--; }
        if (!user || !valid) fail(401, 'invalid_login', 'The username or password is incorrect.');
        const old = session(request); if (old) db.prepare('DELETE FROM sessions WHERE hash=?').run(old.hash);
        const value = token(), csrf = token();
        db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(value), user.id, csrf, Date.now() + 8 * 3600000);
        return send(response, 200, { ok: true }, { 'Set-Cookie': setCookie(value, 8 * 3600) });
      }
      const row = requireSession(request);
      limit('user:' + row.user_id, 240, 60);
      if (path === '/api/logout' && request.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE hash=?').run(row.hash);
        return send(response, 200, { ok: true }, { 'Set-Cookie': setCookie('', 0) });
      }
      if (path === '/api/age/start' && request.method === 'POST') {
        limit('age:' + row.user_id, 4, 3600);
        const reference = token();
        const result = await yoti.start(reference);
        db.prepare('UPDATE sessions SET age_id=?,age_ref=?,age_deadline=?,age_until=0,age_checked=0 WHERE hash=?').run(result.id, reference, Date.now() + 900000, row.hash);
        return send(response, 200, { url: result.url });
      }
      if (path === '/api/age/check' && request.method === 'POST') {
        if (!row.age_id || row.age_deadline <= Date.now()) fail(403, 'age_expired', 'Start a new age verification.');
        if (row.age_checked > Date.now() - 5000) fail(429, 'age_pending', 'Age verification is still processing. Try again shortly.');
        db.prepare('UPDATE sessions SET age_checked=? WHERE hash=?').run(Date.now(), row.hash);
        const result = await yoti.result(row.age_id, row.age_ref);
        if (result.passed) {
          db.prepare('UPDATE sessions SET age_until=?,age_id=NULL,age_ref=NULL,age_deadline=NULL WHERE hash=?').run(Math.min(Date.now() + 3600000, row.expires), row.hash);
          return send(response, 200, { verified: true });
        }
        if (['FAIL','ERROR','CANCELLED','EXPIRED'].includes(result.status)) db.prepare('UPDATE sessions SET age_until=0,age_id=NULL,age_ref=NULL,age_deadline=NULL WHERE hash=?').run(row.hash);
        return send(response, 200, { verified: false, pending: ['PENDING','IN_PROGRESS'].includes(result.status) });
      }
      requireSession(request, true);
      if (path === '/api/catalog' && request.method === 'GET') {
        if (!bunny.configured) fail(503, 'catalog_unconfigured', 'The licensed library is not connected yet.');
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (q.length > 120) fail(400, 'invalid_search', 'Search is limited to 120 characters.');
        const category = url.searchParams.get('category') || '', view = url.searchParams.get('view') || 'all';
        if (!['all','favorites','history'].includes(view)) fail(400, 'invalid_view', 'This library view is invalid.');
        const page = Number(url.searchParams.get('page') || 1);
        if (!Number.isInteger(page) || page < 1 || page > 10000) fail(400, 'invalid_page', 'This page is invalid.');
        const rights = db.prepare(`SELECT licenses.*,favorites.added AS favorite_at,history.position,history.watched FROM licenses LEFT JOIN favorites ON favorites.video_id=licenses.id AND favorites.user_id=? LEFT JOIN history ON history.video_id=licenses.id AND history.user_id=? LIMIT 501`).all(row.user_id, row.user_id).filter(l => allowedLicense(l));
        if (rights.length > 500) fail(503, 'catalog_limit', 'This library needs a larger catalog adapter.');
        const categories = [...new Set(rights.map(l => l.category))].sort();
        const selected = rights.filter(l => (!category || l.category === category) && (view !== 'favorites' || l.favorite_at) && (view !== 'history' || l.watched));
        // Bound upstream concurrency. Only the explicitly licensed ids are fetched.
        const items = [];
        for (let offset = 0; offset < selected.length; offset += 4) {
          const batch = await Promise.all(selected.slice(offset, offset + 4).map(async license => {
            const metadata = await bunny.video(license.provider_id);
            return { id: license.id, title: metadata.title, category: license.category, duration: metadata.duration, favorite: !!license.favorite_at, position: license.position || 0, watchedAt: license.watched || null, thumbnail: bunny.thumbnail(license.provider_id, expires(row, license, 120)) };
          })); items.push(...batch);
        }
        requireSession(request, true);
        const filtered = items.filter(i => allowedLicense(db.prepare('SELECT * FROM licenses WHERE id=?').get(i.id)) && (!q || (i.title + ' ' + i.category).toLowerCase().includes(q)));
        filtered.sort(view === 'history' ? (a,b) => b.watchedAt - a.watchedAt : (a,b) => a.title.localeCompare(b.title));
        return send(response, 200, { items: filtered.slice((page-1)*24, page*24), categories, total: filtered.length, page, pages: Math.ceil(filtered.length / 24) });
      }
      if (path === '/api/history' && request.method === 'DELETE') {
        db.prepare('DELETE FROM history WHERE user_id=?').run(row.user_id);
        return send(response, 200, { ok: true });
      }
      const match = path.match(/^\/api\/videos\/([a-f0-9-]{36})\/(playback|favorite|progress)$/);
      if (match) {
        const license = entitled(match[1]);
        if (match[2] === 'favorite' && ['PUT','DELETE'].includes(request.method)) {
          if (request.method === 'PUT') db.prepare('INSERT OR IGNORE INTO favorites VALUES(?,?,?)').run(row.user_id, license.id, Date.now());
          else db.prepare('DELETE FROM favorites WHERE user_id=? AND video_id=?').run(row.user_id, license.id);
          return send(response, 200, { favorite: request.method === 'PUT' });
        }
        if (match[2] === 'playback' && request.method === 'POST') {
          limit('play:' + row.user_id, 30, 60);
          const metadata = await bunny.video(license.provider_id);
          const fresh = requireSession(request, true);
          const end = expires(fresh, entitled(license.id), 300);
          if (end * 1000 <= Date.now() + 10000) fail(403, 'access_expiring', 'Your access is expiring. Verify your age again before watching.');
          const history = db.prepare('SELECT position FROM history WHERE user_id=? AND video_id=?').get(row.user_id, license.id);
          return send(response, 200, { ...bunny.playback(license.provider_id, end), title: metadata.title, duration: metadata.duration, position: history?.position || 0, mediaOrigin: `https://${config.bunnyHost}` });
        }
        if (match[2] === 'progress' && request.method === 'PUT') {
          const data = await body(request), metadata = await bunny.video(license.provider_id);
          requireSession(request, true); entitled(license.id);
          if (!Number.isFinite(data.position) || data.position < 0 || data.position > metadata.duration + 1) fail(400, 'invalid_position', 'This playback position is invalid.');
          db.prepare('INSERT INTO history VALUES(?,?,?,?) ON CONFLICT(user_id,video_id) DO UPDATE SET position=excluded.position,watched=excluded.watched').run(row.user_id, license.id, Math.min(data.position, metadata.duration), Date.now());
          return send(response, 200, { ok: true });
        }
      }
      fail(404, 'not_found', 'This endpoint does not exist.');
    } catch (error) {
      if (!response.headersSent) send(response, error instanceof ServiceError ? error.status : 500, { code: error instanceof ServiceError ? error.code : 'internal_error', message: error instanceof ServiceError ? error.message : 'The request could not be completed.' });
      else response.end();
    }
  }
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
