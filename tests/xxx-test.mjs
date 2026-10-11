import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './pw.mjs';
import { createPortal, readConfig } from '../xxx-api/server.mjs';
import { openStore, createUser, importLicense } from '../xxx-api/store.mjs';

// The fixture server never deploys. It supplies generated color-bar video and
// synthetic provider responses to the real UI and backend, with no live account.
const root = resolve(fileURLToPath(new URL('..',import.meta.url)));
const port = Number(process.env.CJ_XXX_PORT || 8861), apiPort = port + 1;
const origin = `http://127.0.0.1:${port}`;
const config = readConfig({ PORTAL_LOCAL:'true',PORTAL_ORIGIN:origin,API_ORIGIN:`http://127.0.0.1:${apiPort}`,BUNNY_API_KEY:'test-only-key',BUNNY_TOKEN_KEY:'test-only-token-key',BUNNY_LIBRARY_ID:'123',BUNNY_CDN_HOST:'test-fixture.b-cdn.net',BUNNY_CUSTOM_HLS_APPROVED:'true',YOTI_API_KEY:'test-only-key',YOTI_SDK_ID:'test-only-sdk' });
const temp = mkdtempSync(join(tmpdir(),'cj-xxx-browser-'));
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-t','60','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-preset','ultrafast','-g','50','-sc_threshold','0','-f','hls','-hls_time','5','-hls_list_size','0',join(temp,'playlist.m3u8')]);
const db = openStore(':memory:');
await createUser(db,'viewer','test-only-viewer-password');
const ids = [];
for (let index=0;index<26;index++) {
  const providerId = `11111111-1111-4111-8111-${String(index).padStart(12,'0')}`;
  ids.push(importLicense(db,{ providerVideoId:providerId,licenseReference:'TEST ONLY: generated color bars',category:index % 2 ? 'Collection B' : 'Collection A',startsAt:'2026-01-01T00:00:00Z',endsAt:'2035-01-01T00:00:00Z',countries:['*'],fullLengthAuthorized:true,nativeHlsAuthorized:true,drmRequired:false }));
}
const age = new Map();
const fetcher = async (url,options) => {
  if (url.endsWith('/sessions')) { const id = randomUUID(); age.set(id,JSON.parse(options.body).reference_id); return Response.json({ id }); }
  if (url.includes('/result')) { const id = url.split('/').at(-2); return Response.json({ id,reference_id:age.get(id),sdk_id:config.yotiSdk,type:'OVER',status:'COMPLETE',age:18,method:'DIGITAL_ID',digital_id:{ allowed:true,threshold:18 } }); }
  const id = url.split('/').at(-1), number = Number(id.slice(-12));
  return Response.json({ guid:id,videoLibraryId:123,status:4,length:60,title:number === 0 ? 'Fixture 00 <img src=x onerror=alert(1)>' : `Fixture ${String(number).padStart(2,'0')} ${number === 1 ? 'a'.repeat(150) : 'licensed color bars'}` });
};
const { server:api } = await createPortal(config,{ db,fetcher });
const staticServer = http.createServer((request,response) => {
  const path = new URL(request.url,origin).pathname;
  const file = resolve(root,'.' + decodeURIComponent(path) + (path.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + '/') || !existsSync(file)) { response.writeHead(404); return response.end(); }
  let data = readFileSync(file);
  if (file === join(root,'333/index.html')) data = Buffer.from(data.toString().replace('name="cj-portal-api" content=""',`name="cj-portal-api" content="${config.apiOrigin}"`).replace("connect-src 'self'",`connect-src 'self' ${config.apiOrigin}`));
  const type = ({ '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png' })[extname(file)] || 'application/octet-stream';
  response.writeHead(200,{ 'Content-Type':type,'Cache-Control':'no-store' }); response.end(data);
});
await new Promise(resolve => api.listen(apiPort,'127.0.0.1',resolve));
await new Promise(resolve => staticServer.listen(port,'127.0.0.1',resolve));
const browser = await launch({ args:['--no-sandbox'] });
let checks = 0;
try {
  assert.equal((await fetch(origin + '/xxx/')).status,404); checks++;
  for (const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]) {
    const context = await browser.newContext({ viewport:{ width,height },hasTouch:width < 500,isMobile:width < 500 });
    const errors = [], mediaRequests = [];
    let playbackRequests = 0;
    if (width === 375) await context.route(config.apiOrigin + '/api/videos/*/playback',async route => {
      const response = await route.fetch(), data = await response.json(); playbackRequests++;
      // Shorten only the test client's advertised expiry to exercise renewal
      // without waiting five minutes. The server still signs genuine tokens.
      await route.fulfill({ response,json:{ ...data,expiresAt:playbackRequests === 1 ? Date.now()+3500 : data.expiresAt } });
    });
    await context.route('https://fonts.googleapis.com/**',r => r.fulfill({ contentType:'text/css',body:'' }));
    await context.route('https://age.yoti.com/**',r => r.fulfill({ contentType:'text/html',body:'<!doctype html><title>Test verification</title><p>Test-only verification fixture.</p>' }));
    await context.route('https://test-fixture.b-cdn.net/**',async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.jpg')) return route.fulfill({ contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64') });
      mediaRequests.push(url.pathname);
      assert.match(url.pathname,/^\/bcdn_token=HS256-/);
      const name = url.pathname.split('/').at(-1), path = join(temp,name);
      if (!existsSync(path)) return route.fulfill({ status:404,body:'' });
      await route.fulfill({ contentType:name.endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',body:readFileSync(path),headers:{ 'Access-Control-Allow-Origin':'*' } });
    });
    const page = await context.newPage();
    page.on('pageerror',e => errors.push(e.message)); page.on('console',msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const measure = async (scope = page) => scope.evaluate(() => ({ overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,wide:[...document.querySelectorAll('button,input,header,article')].filter(n => n.getBoundingClientRect().right > innerWidth + 1 && n.getBoundingClientRect().width > 0).map(n => n.id || n.tagName),cardWidths:[...document.querySelectorAll('.video-card')].slice(0,2).map(n => Math.round(n.getBoundingClientRect().width)) }));
    await page.goto(origin + '/333/',{ waitUntil:'networkidle' });
    await page.waitForFunction(() => !document.getElementById('sign-in').disabled);
    assert.equal(await page.locator('#library').isVisible(),false); checks++;
    assert.equal(await page.locator('#grid img').count(),0); checks++;
    assert.equal((await measure()).overflow,0); checks++;
    await page.locator('#user').fill('viewer'); await page.locator('#password').fill('test-only-viewer-password'); await page.locator('#sign-in').click();
    await page.locator('#age-panel').waitFor({ state:'visible' });
    assert.equal(await page.locator('#library').isVisible(),false); checks++;
    assert.equal(await page.locator('#password').inputValue(),''); checks++;
    assert.equal((await measure()).overflow,0); checks++;
    await page.locator('#verify-age').click(); await page.waitForURL('https://age.yoti.com/**');
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    await page.goto(origin + '/333/?sessionId=' + sessionId);
    await page.locator('#library').waitFor({ state:'visible' }); await page.locator('.video-card').first().waitFor();
    assert.equal(await page.locator('.video-card').count(),24); checks++;
    assert.equal(await page.locator('#grid img[onerror]').count(),0); checks++;
    assert.match(await page.locator('.card-copy h2').first().innerText(),/<img/); checks++;
    assert.equal(page.url(),origin + '/333/'); checks++;
    const dimensions = await measure(); assert.equal(dimensions.overflow,0); checks++;
    assert.deepEqual(dimensions.wide,[]); checks++;
    console.log(`  ${width}px library: overflow ${dimensions.overflow}px, card widths ${dimensions.cardWidths.join(', ')}px`);
    if (width === 375) await page.screenshot({ path:join(root,'tests/xxx-375.png'),fullPage:true });
    await page.locator('.star').first().click(); await page.waitForFunction(() => document.querySelector('.star').getAttribute('aria-pressed') === 'true');
    await page.locator('[data-view="favorites"]').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 1); checks++;
    await page.locator('.star').first().click(); await page.locator('#empty').waitFor({ state:'visible' });
    assert.equal(await page.locator('.video-card').count(),0); checks++;
    await page.locator('[data-view="all"]').click(); await page.locator('.video-card').first().waitFor();
    await page.locator('#query').fill('Fixture 25'); await page.locator('#search button').click();
    await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 1); checks++;
    await page.locator('#query').fill(''); await page.locator('#search button').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 24);
    await page.locator('[data-category="Collection A"]').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 13); checks++;
    await page.locator('[data-category=""]').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 24);
    await page.locator('#next').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 2); checks++;
    await page.locator('#prev').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 24);
    await page.locator('.watch').first().click(); await page.locator('#player-dialog').waitFor({ state:'visible' });
    await page.waitForFunction(() => document.getElementById('video').readyState >= 1);
    assert.equal(await page.locator('#video').getAttribute('playsinline'),''); checks++;
    assert.equal(await page.locator('#video').evaluate(v => v.paused),true); checks++;
    await page.locator('#video').evaluate(v => v.play());
    await page.waitForFunction(() => document.getElementById('video').currentTime > .2);
    await page.locator('#video').evaluate(v => { v.currentTime = 20; });
    await page.waitForFunction(() => document.getElementById('video').currentTime >= 20);
    if (width === 375) {
      const deadline = Date.now()+10000;
      while (playbackRequests < 2 && Date.now() < deadline) await page.waitForTimeout(100);
      assert.ok(playbackRequests >= 2,'Playback access did not renew within ten seconds.');
      await page.waitForFunction(() => document.getElementById('video').currentTime >= 20 && !document.getElementById('video').paused);
      checks++;
    }
    const playerDimensions = await measure(); assert.equal(playerDimensions.overflow,0); checks++;
    await page.locator('#close-player').click();
    assert.ok(mediaRequests.length > 1); checks++;
    await page.locator('[data-view="history"]').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 1);
    assert.match(await page.locator('.resume').innerText(),/Resume at 0:2/); checks++;
    await page.reload(); await page.locator('.video-card').first().waitFor();
    await page.locator('[data-view="history"]').click(); await page.waitForFunction(() => document.querySelectorAll('.video-card').length === 1); checks++;
    await page.locator('#clear-history').click(); await page.locator('#confirm-clear').click(); await page.locator('#empty').waitFor({ state:'visible' });
    assert.equal(await page.locator('.video-card').count(),0); checks++;
    await page.locator('#logout').click(); await page.locator('#login-panel').waitFor({ state:'visible' });
    assert.equal(await page.locator('#grid img').count(),0); checks++;
    assert.equal(await page.evaluate(() => Object.keys(localStorage).length),0); checks++;
    await page.goto(origin + '/');
    const frame = page.frameLocator('#shellFrame');
    await frame.locator('.tab[data-page="1"]').click();
    assert.equal(await frame.locator('a[href="/333/"]').count(),0); checks++;
    await frame.locator('#secretLogo').click({ clickCount:3 });
    assert.equal(await frame.locator('a[href="/333/"]').count(),0); checks++;
    assert.equal(await frame.locator('a[href="/qwikpen/"]').isVisible(),true); checks++;
    await page.reload();
    await frame.locator('a[href="/school/"]').waitFor({ state:'visible' });
    assert.equal(await frame.locator('a[href="/333/"]').count(),0); checks++;
    const home = page.frames().find(f => f !== page.mainFrame() && f.url().includes('/home/'));
    assert.equal((await measure(home)).overflow,0); checks++;
    // Direct navigation still works without a link in the site's navigation.
    await frame.locator('body').evaluate(() => { location.href = '/333/'; });
    await page.waitForURL(origin + '/333/');
    await frame.locator('#login-panel').waitFor({ state:'visible' }); checks++;
    const child = page.frames().find(f => f !== page.mainFrame() && f.url().includes('/333/'));
    assert.equal((await measure(child)).overflow,0); checks++;
    const shell = await page.locator('#shellFrame').evaluate(n => ({ bottom:n.getBoundingClientRect().bottom,visible:visualViewport.height }));
    assert.ok(Math.abs(shell.bottom - shell.visible) < 1); checks++;
    assert.match(await page.locator('#shellFrame').getAttribute('allow'),/fullscreen/); checks++;
    await page.goBack(); await page.waitForURL(origin + '/');
    await frame.locator('#secretLogo').waitFor({ state:'visible' }); checks++;
    await page.goForward(); await page.waitForURL(origin + '/333/');
    await frame.locator('#login-panel').waitFor({ state:'visible' }); checks++;
    assert.deepEqual(errors,[]); checks++;
    await context.close();
    db.prepare('DELETE FROM favorites').run(); db.prepare('DELETE FROM history').run();
  }
  console.log(`${checks} private library browser checks passed, including real HLS decoding.`);
} finally {
  await browser.close(); await new Promise(resolve => staticServer.close(resolve)); await new Promise(resolve => api.close(resolve)); db.close(); rmSync(temp,{ recursive:true,force:true });
}
