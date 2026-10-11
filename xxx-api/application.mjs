import { bunnyAdapter, yotiAdapter, ServiceError } from './providers.mjs';
import { allowedLicense } from './license.mjs';

// Shared API policy. Node SQLite and Cloudflare D1 supply the same statement interface.
export async function createApplication(config, { db, fetcher = fetch, security, clientIp, adapters }) {
  const bunny = adapters?.bunny || bunnyAdapter(config, fetcher), yoti = adapters?.yoti || yotiAdapter(config, fetcher);
  const cookieName = config.local ? 'cjxxx_local' : '__Host-cjxxx';
  const { digest, token, hashPassword, verifyPassword } = security;
  const dummy = security.dummyHash || await hashPassword(token());
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
  async function session(request) {
    const cookies = (request.headers.cookie || '').split(';').map(c => c.trim());
    const values = cookies.filter(c => c.startsWith(cookieName + '='));
    if (values.length !== 1) return null;
    const value = values[0].slice(cookieName.length + 1);
    if (!/^[a-zA-Z0-9_-]{43}$/.test(value)) return null;
    return (await db.prepare(`SELECT sessions.*,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>? AND users.enabled=1`).get(digest(value), Date.now())) || null;
  }
  async function requireSession(request, age = false) {
    const row = await session(request);
    if (!row) fail(401, 'sign_in_required', 'Please sign in again.');
    if (request.method !== 'GET' && request.headers['x-csrf-token'] !== row.csrf) fail(403, 'csrf_invalid', 'Please reload the page and try again.');
    if (age && row.age_until <= Date.now()) fail(403, 'age_required', 'Verify your age before opening the library.');
    return row;
  }
  async function entitled(id) {
    const row = (await db.prepare('SELECT * FROM licenses WHERE id=?').get(id));
    if (!allowedLicense(row)) fail(404, 'video_unavailable', 'This video is unavailable.');
    return row;
  }
  function expires(row, license, seconds) {
    return Math.floor(Math.min(Date.now() + seconds * 1000, row.expires, row.age_until, license.ends) / 1000);
  }
  async function limit(key, maximum, seconds) {
    const now = Date.now();
    const accepted = await db.prepare(`INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END WHERE limits.reset<=? OR limits.count<? RETURNING count`).get(key, now+seconds*1000, now, now, now, maximum);
    if (!accepted) fail(429, 'rate_limited', 'Too many requests. Try again later.');
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
      const ip = clientIp ? clientIp(request) : ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ? (request.headers['x-portal-client-ip'] || peer) : peer;
      await limit('ip:' + digest(String(ip)), 300, 60);
      if (path === '/api/session' && request.method === 'GET') {
        const row = await session(request);
        return send(response, 200, row ? { authenticated: true, username: row.username, csrf: row.csrf, ageVerified: row.age_until > Date.now(), ageExpiresAt: row.age_until, ageEnabled: yoti.configured, catalogConfigured: bunny.configured, minimumAge: config.minimumAge } : { authenticated: false });
      }
      if (path === '/api/login' && request.method === 'POST') {
        const data = await body(request);
        if (typeof data.username !== 'string' || typeof data.password !== 'string' || data.username.length > 64 || data.password.length > 256) fail(400, 'invalid_login', 'Enter your username and password.');
        await limit('login-ip:' + digest(String(ip)), 10, 900);
        const username = data.username.trim().toLowerCase();
        await limit('login-user:' + digest(username), 8, 900);
        if (passwordChecks >= 2) fail(503, 'login_busy', 'Sign-in is busy. Try again shortly.');
        const user = (await db.prepare('SELECT * FROM users WHERE username=? AND enabled=1').get(username));
        let valid; passwordChecks++;
        try { valid = await verifyPassword(data.password, user?.password_hash || dummy); } finally { passwordChecks--; }
        if (!user || !valid) fail(401, 'invalid_login', 'The username or password is incorrect.');
        const old = await session(request); if (old) (await db.prepare('DELETE FROM sessions WHERE hash=?').run(old.hash));
        const value = token(), csrf = token();
        // A reset or account disable while the KDF runs must invalidate this login.
        const inserted = await db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires) SELECT ?,?,?,? FROM users WHERE id=? AND password_hash=? AND enabled=1').run(digest(value), user.id, csrf, Date.now() + 8 * 3600000, user.id, user.password_hash);
        if (!inserted.changes) fail(401, 'invalid_login', 'The username or password is incorrect.');
        return send(response, 200, { ok: true }, { 'Set-Cookie': setCookie(value, 8 * 3600) });
      }
      const row = await requireSession(request);
      await limit('user:' + row.user_id, 240, 60);
      if (path === '/api/logout' && request.method === 'POST') {
        (await db.prepare('DELETE FROM sessions WHERE hash=?').run(row.hash));
        return send(response, 200, { ok: true }, { 'Set-Cookie': setCookie('', 0) });
      }
      if (path === '/api/age/start' && request.method === 'POST') {
        await limit('age:' + row.user_id, 4, 3600);
        const reference = token();
        const result = await yoti.start(reference);
        (await db.prepare('UPDATE sessions SET age_id=?,age_ref=?,age_deadline=?,age_until=0,age_checked=0 WHERE hash=?').run(result.id, reference, Date.now() + 900000, row.hash));
        return send(response, 200, { url: result.url });
      }
      if (path === '/api/age/check' && request.method === 'POST') {
        if (!row.age_id || row.age_deadline <= Date.now()) fail(403, 'age_expired', 'Start a new age verification.');
        if (row.age_checked > Date.now() - 5000) fail(429, 'age_pending', 'Age verification is still processing. Try again shortly.');
        (await db.prepare('UPDATE sessions SET age_checked=? WHERE hash=?').run(Date.now(), row.hash));
        const result = await yoti.result(row.age_id, row.age_ref);
        if (result.passed) {
          (await db.prepare('UPDATE sessions SET age_until=?,age_id=NULL,age_ref=NULL,age_deadline=NULL WHERE hash=?').run(Math.min(Date.now() + 3600000, row.expires), row.hash));
          return send(response, 200, { verified: true });
        }
        if (['FAIL','ERROR','CANCELLED','EXPIRED'].includes(result.status)) (await db.prepare('UPDATE sessions SET age_until=0,age_id=NULL,age_ref=NULL,age_deadline=NULL WHERE hash=?').run(row.hash));
        return send(response, 200, { verified: false, pending: ['PENDING','IN_PROGRESS'].includes(result.status) });
      }
      await requireSession(request, true);
      if (path === '/api/catalog' && request.method === 'GET') {
        if (!bunny.configured) fail(503, 'catalog_unconfigured', 'The licensed library is not connected yet.');
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (q.length > 120) fail(400, 'invalid_search', 'Search is limited to 120 characters.');
        const category = url.searchParams.get('category') || '', view = url.searchParams.get('view') || 'all';
        if (!['all','favorites','history'].includes(view)) fail(400, 'invalid_view', 'This library view is invalid.');
        const page = Number(url.searchParams.get('page') || 1);
        if (!Number.isInteger(page) || page < 1 || page > 10000) fail(400, 'invalid_page', 'This page is invalid.');
        const rights = (await db.prepare(`SELECT licenses.*,favorites.added AS favorite_at,history.position,history.watched FROM licenses LEFT JOIN favorites ON favorites.video_id=licenses.id AND favorites.user_id=? LEFT JOIN history ON history.video_id=licenses.id AND history.user_id=? LIMIT 501`).all(row.user_id, row.user_id)).filter(l => allowedLicense(l));
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
        await requireSession(request, true);
        const available = new Set((await db.prepare('SELECT * FROM licenses LIMIT 501').all()).filter(l => allowedLicense(l)).map(l => l.id));
        const filtered = items.filter(i => available.has(i.id) && (!q || (i.title + ' ' + i.category).toLowerCase().includes(q)));
        filtered.sort(view === 'history' ? (a,b) => b.watchedAt - a.watchedAt : (a,b) => a.title.localeCompare(b.title));
        return send(response, 200, { items: filtered.slice((page-1)*24, page*24), categories, total: filtered.length, page, pages: Math.ceil(filtered.length / 24) });
      }
      if (path === '/api/history' && request.method === 'DELETE') {
        (await db.prepare('DELETE FROM history WHERE user_id=?').run(row.user_id));
        return send(response, 200, { ok: true });
      }
      const match = path.match(/^\/api\/videos\/([a-f0-9-]{36})\/(playback|favorite|progress)$/);
      if (match) {
        const license = await entitled(match[1]);
        if (match[2] === 'favorite' && ['PUT','DELETE'].includes(request.method)) {
          if (request.method === 'PUT') (await db.prepare('INSERT OR IGNORE INTO favorites VALUES(?,?,?)').run(row.user_id, license.id, Date.now()));
          else (await db.prepare('DELETE FROM favorites WHERE user_id=? AND video_id=?').run(row.user_id, license.id));
          return send(response, 200, { favorite: request.method === 'PUT' });
        }
        if (match[2] === 'playback' && request.method === 'POST') {
          await limit('play:' + row.user_id, 30, 60);
          const metadata = await bunny.video(license.provider_id);
          const fresh = await requireSession(request, true);
          const end = expires(fresh, await entitled(license.id), 300);
          if (end * 1000 <= Date.now() + 10000) fail(403, 'access_expiring', 'Your access is expiring. Verify your age again before watching.');
          const history = (await db.prepare('SELECT position FROM history WHERE user_id=? AND video_id=?').get(row.user_id, license.id));
          return send(response, 200, { ...bunny.playback(license.provider_id, end), title: metadata.title, duration: metadata.duration, position: history?.position || 0, mediaOrigin: `https://${config.bunnyHost}` });
        }
        if (match[2] === 'progress' && request.method === 'PUT') {
          const data = await body(request), metadata = await bunny.video(license.provider_id);
          await requireSession(request, true); await entitled(license.id);
          if (!Number.isFinite(data.position) || data.position < 0 || data.position > metadata.duration + 1) fail(400, 'invalid_position', 'This playback position is invalid.');
          (await db.prepare('INSERT INTO history VALUES(?,?,?,?) ON CONFLICT(user_id,video_id) DO UPDATE SET position=excluded.position,watched=excluded.watched').run(row.user_id, license.id, Math.min(data.position, metadata.duration), Date.now()));
          return send(response, 200, { ok: true });
        }
      }
      fail(404, 'not_found', 'This endpoint does not exist.');
    } catch (error) {
      if (!response.headersSent) send(response, error instanceof ServiceError ? error.status : 500, { code: error instanceof ServiceError ? error.code : 'internal_error', message: error instanceof ServiceError ? error.message : 'The request could not be completed.' });
      else response.end();
    }
  }
  return handler;
}
