import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from '../xxx-api/cloudflare/node_modules/miniflare/dist/src/index.js';
import { hashPassword, verifyPassword } from '../xxx-api/cloudflare/security.mjs';
import { licenseValues } from '../xxx-api/license.mjs';

const origin = 'https://portal-api.cjaffa.com', portal = 'https://tools.cjaffa.com';
const video = '11111111-1111-4111-8111-111111111111';
const title = id => ({ providerVideoId:id, licenseReference:'TEST ONLY: generated color bars', category:'Fixture collection', startsAt:'2026-01-01T00:00:00Z', endsAt:'2035-01-01T00:00:00Z', countries:['*'], fullLengthAuthorized:true, nativeHlsAuthorized:true, drmRequired:false });

test('Cloudflare passwords enforce a bounded OWASP scrypt profile', async () => {
  await assert.rejects(hashPassword('short'));
  const stored = await hashPassword('test-only-cloudflare-password');
  assert.match(stored,/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(await verifyPassword('test-only-cloudflare-password',stored),true);
  assert.equal(await verifyPassword('wrong-password',stored),false);
  assert.equal(await verifyPassword('test-only-cloudflare-password',stored.replace('32768','16384')),false);
  const results = await Promise.allSettled([1,2,3,4].map(() => verifyPassword('wrong-password',stored)));
  assert.equal(results.filter(r => r.status === 'rejected').length,2);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'login_busy'));
});

test('real Workers runtime and D1 enforce private access, age and per-user playback state', async () => {
  const ages = new Map(), calls = [];
  let complete = false, badBinding = false, fail = false;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true,
    scriptPath:fileURLToPath(new URL('../xxx-api/cloudflare/.wrangler/build/worker.js',import.meta.url)),
    compatibilityDate:'2026-10-11',compatibilityFlags:['nodejs_compat'],cf:false,
    log:new Log(LogLevel.ERROR),d1Databases:['DB'],
    bindings:{ PORTAL_ORIGIN:portal,API_ORIGIN:origin,MINIMUM_AGE:'18',BUNNY_LIBRARY_ID:'123',BUNNY_CDN_HOST:'test-fixture.b-cdn.net',BUNNY_API_KEY:'test-only-api-key',BUNNY_TOKEN_KEY:'test-only-token-key',BUNNY_CUSTOM_HLS_APPROVED:'true',YOTI_API_KEY:'test-only-yoti-key',YOTI_SDK_ID:'test-only-sdk' },
    outboundService:async request => {
      calls.push(request.url);
      if (fail === 'redirect') return new Response(null,{ status:302,headers:{ Location:'https://evil.example/collect' } });
      if (fail) return new Response('private upstream error',{ status:403 });
      if (request.url.endsWith('/sessions')) {
        const input = await request.json(), id = randomUUID(); ages.set(id,input.reference_id);
        assert.equal(input.callback.url,portal + '/xxx/');
        return Response.json({ id });
      }
      if (request.url.includes('/result')) {
        const id = request.url.split('/').at(-2);
        return Response.json({ id,reference_id:badBinding ? 'other-session' : ages.get(id),sdk_id:'test-only-sdk',type:'OVER',status:complete ? 'COMPLETE' : 'PENDING',age:18,method:'DIGITAL_ID',digital_id:{ allowed:true,threshold:18 } });
      }
      assert.equal(new URL(request.url).hostname,'video.bunnycdn.com');
      assert.equal(request.headers.get('AccessKey'),'test-only-api-key');
      return Response.json({ guid:request.url.split('/').at(-1),videoLibraryId:123,status:4,length:60,title:'Licensed fixture title' });
    }
  }));
  try {
    const db = await mf.getD1Database('DB');
    await db.exec(readFileSync(new URL('../xxx-api/cloudflare/migrations/0001_private_library.sql',import.meta.url),'utf8'));
    const aliceId = randomUUID(), bobId = randomUUID(), id = randomUUID(), revoked = randomUUID();
    await db.prepare('INSERT INTO users VALUES(?,?,?,1)').bind(aliceId,'alice',await hashPassword('test-only-alice-password')).run();
    await db.prepare('INSERT INTO users VALUES(?,?,?,1)').bind(bobId,'bob',await hashPassword('test-only-bob-password')).run();
    await db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,...licenseValues(title(video))).run();
    await db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?,?,?,?,?,?)').bind(revoked,...licenseValues({ ...title('22222222-2222-4222-8222-222222222222'),drmRequired:true })).run();
    async function request(path,{ method='GET',jar={},body,csrf=jar.csrf,site=portal,host=origin } = {}) {
      const response = await mf.dispatchFetch(host+path,{ method,headers:{ Origin:site,...(jar.cookie ? { Cookie:jar.cookie } : {}),...(csrf ? { 'X-CSRF-Token':csrf } : {}),...(body === undefined ? {} : { 'Content-Type':'application/json' }) },body:body === undefined ? undefined : JSON.stringify(body) });
      const data = response.status === 204 ? null : await response.json();
      const cookie = response.headers.get('Set-Cookie'); if (cookie) jar.cookie = cookie.split(';')[0];
      if (data?.csrf) jar.csrf = data.csrf;
      return { response,data };
    }
    assert.equal((await request('/healthz')).response.status,200);
    assert.equal((await request('/api/session',{ host:'https://wrong.workers.dev' })).response.status,503);
    assert.equal((await request('/api/session',{ site:'https://evil.example' })).response.status,403);
    assert.equal((await request('/api/session',{ method:'OPTIONS' })).response.status,204);
    assert.equal((await request('/api/catalog')).response.status,401);
    assert.equal(calls.length,0);
    const alice = {}, bob = {};
    const login = await request('/api/login',{ method:'POST',jar:alice,body:{ username:'alice',password:'test-only-alice-password' } });
    assert.equal(login.response.status,200,JSON.stringify(login.data));
    assert.match(login.response.headers.get('Set-Cookie'),/^__Host-cjxxx=.+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
    assert.match(login.response.headers.get('Cache-Control'),/no-store/);
    await request('/api/session',{ jar:alice });
    assert.equal((await request('/api/catalog',{ jar:alice })).response.status,403);
    assert.equal((await request('/api/age/start',{ method:'POST',jar:alice,csrf:'forged' })).response.status,403);
    assert.equal(calls.length,0);
    const age = await request('/api/age/start',{ method:'POST',jar:alice });
    assert.equal(age.response.status,200,JSON.stringify({ data:age.data,calls }));
    assert.equal(new URL(age.data.url).searchParams.get('sdkId'),'test-only-sdk');
    assert.equal((await request('/api/age/check',{ method:'POST',jar:alice,body:{ verified:true } })).data.verified,false);
    await db.prepare('UPDATE sessions SET age_checked=0 WHERE user_id=?').bind(aliceId).run();
    complete = true; badBinding = true;
    assert.equal((await request('/api/age/check',{ method:'POST',jar:alice })).data.code,'age_binding');
    await db.prepare('UPDATE sessions SET age_checked=0 WHERE user_id=?').bind(aliceId).run();
    badBinding = false;
    assert.equal((await request('/api/age/check',{ method:'POST',jar:alice })).data.verified,true);
    const catalog = await request('/api/catalog',{ jar:alice });
    assert.equal(catalog.data.total,1);
    assert.equal(JSON.stringify(catalog.data).includes('test-only-api-key'),false);
    assert.equal((await request(`/api/videos/${revoked}/playback`,{ method:'POST',jar:alice })).response.status,404);
    const playback = await request(`/api/videos/${id}/playback`,{ method:'POST',jar:alice });
    assert.equal(playback.response.status,200);
    assert.match(playback.data.url,/\/bcdn_token=HS256-/);
    await db.prepare('UPDATE licenses SET ends=0 WHERE id=?').bind(id).run();
    assert.equal((await request(`/api/videos/${id}/playback`,{ method:'POST',jar:alice })).response.status,404);
    await db.prepare('UPDATE licenses SET ends=? WHERE id=?').bind(Date.parse('2035-01-01T00:00:00Z'),id).run();
    await request(`/api/videos/${id}/favorite`,{ method:'PUT',jar:alice });
    assert.equal((await request('/api/catalog?view=favorites',{ jar:alice })).data.total,1);
    await request(`/api/videos/${id}/progress`,{ method:'PUT',jar:alice,body:{ position:20 } });
    assert.equal((await request('/api/catalog?view=history',{ jar:alice })).data.items[0].position,20);
    await request('/api/login',{ method:'POST',jar:bob,body:{ username:'bob',password:'test-only-bob-password' } });
    await request('/api/session',{ jar:bob });
    assert.equal((await request('/api/age/check',{ method:'POST',jar:bob,body:{ sessionId:new URL(age.data.url).searchParams.get('sessionId') } })).response.status,403);
    await db.prepare('UPDATE sessions SET age_until=? WHERE user_id=?').bind(Date.now()+60000,bobId).run();
    assert.equal((await request('/api/catalog?view=favorites',{ jar:bob })).data.total,0);
    assert.equal((await request('/api/catalog?view=history',{ jar:bob })).data.total,0);
    await request('/api/history',{ method:'DELETE',jar:bob });
    assert.equal((await request('/api/catalog?view=history',{ jar:alice })).data.total,1);
    await db.prepare('UPDATE sessions SET age_until=0 WHERE user_id=?').bind(aliceId).run();
    assert.equal((await request('/api/catalog',{ jar:alice })).response.status,403);
    await db.prepare('UPDATE sessions SET age_until=? WHERE user_id=?').bind(Date.now()+60000,aliceId).run();
    fail = true;
    const failure = await request('/api/age/start',{ method:'POST',jar:alice });
    assert.equal(failure.response.status,502);
    assert.equal(JSON.stringify(failure.data).includes('private upstream error'),false);
    fail = 'redirect';
    const beforeRedirect = calls.length;
    assert.equal((await request('/api/age/start',{ method:'POST',jar:alice })).response.status,502);
    assert.equal(calls.length,beforeRedirect+1,'The Worker followed a provider redirect.');
    fail = false;
    await request('/api/logout',{ method:'POST',jar:alice });
    assert.equal((await request('/api/catalog',{ jar:alice })).response.status,401);
    await db.prepare('UPDATE users SET enabled=0 WHERE id=?').bind(bobId).run();
    assert.equal((await request('/api/catalog',{ jar:bob })).response.status,401);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?').bind(bobId).first()).count,0);
    await request('/api/login',{ method:'POST',jar:alice,body:{ username:'alice',password:'test-only-alice-password' } });
    await request('/api/session',{ jar:alice });
    await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword('test-only-new-password'),aliceId).run();
    assert.equal((await request('/api/session',{ jar:alice })).data.authenticated,false);
    await request('/api/login',{ method:'POST',jar:alice,body:{ username:'alice',password:'test-only-new-password' } });
    await db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').bind(aliceId).run();
    assert.equal((await request('/api/session',{ jar:alice })).data.authenticated,false);
    const attempts = await Promise.all(Array.from({ length:20 },() => request('/api/login',{ method:'POST',body:{ username:'unknown',password:'wrong-password' } })));
    assert.ok(attempts.filter(r => r.response.status === 429).length >= 10);
    assert.ok(attempts.every(r => [401,429,503].includes(r.response.status)));
    assert.equal((await db.prepare('SELECT position FROM history WHERE user_id=?').bind(aliceId).first()).position,20);
    await db.prepare('DELETE FROM licenses WHERE id=?').bind(id).run();
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM history').first()).count,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM favorites').first()).count,0);
    await db.prepare('UPDATE schema_version SET version=2').run();
    assert.equal((await request('/api/session')).response.status,503);
  } finally { await mf.dispose(); }
});
