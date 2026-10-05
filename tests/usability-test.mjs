import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";
import { tileBytes } from "./tiles.mjs";

const browser = await launch();
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const close = (actual, expected) => { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`); checks++; };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("cjHorizonV1")));
const mainTimes = page => page.locator(".terrain-time").allTextContents();
const ready = page => page.waitForFunction(() => document.getElementById("run").textContent === "Read again");
const ground = page => page.locator(".ground-comparison dd").evaluateAll(nodes => nodes.map(n => ({
  text: n.textContent, metres: Number(n.dataset.metres), km: Number(n.dataset.km)
})));
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  let tileRequests = 0;
  await ctx.route("**/elevation-tiles-prod/**", async route => {
    tileRequests++;
    const body = await tileBytes(route.request().url());
    await route.fulfill({ status: body ? 200 : 404, contentType: "image/png", body: body || "",
      headers: { "Access-Control-Allow-Origin": "*" } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/horizon/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  equal(await page.inputValue("#units"), "feet");
  equal(await page.inputValue("#tz"), "America/New_York");
  equal(await page.locator("label[for=elev]").textContent(), "Height of the ground, in feet");
  equal(await page.inputValue("#eye"), "0");
  const canonical = await stored(page), before = await mainTimes(page), originalGround = await ground(page);
  equal(before, await page.evaluate(() => ["riseBox", "setBox"].map(id =>
    document.querySelectorAll(`#${id} .t:not(.head)`)[4].childNodes[0].textContent.trim())));
  close(originalGround[2].metres, originalGround[1].metres - originalGround[0].metres);
  equal(originalGround[0].text, (canonical.elev / 0.3048).toFixed(1) + " ft");
  equal(originalGround[1].text, (originalGround[1].metres / 0.3048).toFixed(1) + " ft");
  const requestsBefore = tileRequests;
  await page.locator("#locationControls").evaluate(n => { n.open = true; });
  await page.locator("#settings").evaluate(n => { n.open = true; });
  await page.selectOption("#units", "metres");
  equal(await mainTimes(page), before);
  close((await stored(page)).elev, canonical.elev);
  equal((await ground(page))[0].text, canonical.elev.toFixed(1) + " m");
  await page.selectOption("#units", "feet");
  await page.locator("#dnext").click();
  await page.locator("#dprev").click();
  equal(await mainTimes(page), before);
  close((await stored(page)).elev, canonical.elev);
  close((await ground(page))[2].metres, originalGround[2].metres);
  equal(tileRequests, requestsBefore);
  console.log("  ok feet/metres conversion preserves map heights, ground differences and both skyline times");

  await page.locator("#locationControls").evaluate(n => { n.open = true; });
  await page.locator("#settings").evaluate(n => { n.open = true; });
  await page.fill("#elev", "1000"); await page.dispatchEvent("#elev", "change");
  await page.fill("#eye", "10"); await page.dispatchEvent("#eye", "change");
  await ready(page);
  close((await stored(page)).elev, 304.8);
  close((await stored(page)).eye, 3.048);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  equal(await page.inputValue("#elev"), "1000");
  equal(await page.inputValue("#eye"), "10");
  close((await stored(page)).elev, 304.8);
  close((await stored(page)).eye, 3.048);
  equal(errors, []);
  await ctx.close();

  // Old storage contains metres even though the new page opens in feet.
  const legacy = await browser.newContext();
  await legacy.addInitScript(() => {
    if (!localStorage.getItem("cjHorizonV1")) localStorage.setItem("cjHorizonV1", JSON.stringify({
      lat: 40.0959, lon: -74.2176, elev: 2000, eye: 1.7, eyeDefaultVersion: 1, tz: "UTC"
    }));
  });
  await legacy.route("**/elevation-tiles-prod/**", r => r.abort());
  const oldPage = await legacy.newPage();
  await oldPage.goto(`${BASE}/horizon/`, { waitUntil: "domcontentloaded" });
  equal(await oldPage.inputValue("#elev"), "6561.7");
  equal(await oldPage.inputValue("#eye"), "5.6");
  await oldPage.locator("#locationControls").evaluate(n => { n.open = true; });
  await oldPage.locator("#settings").evaluate(n => { n.open = true; });
  await oldPage.selectOption("#units", "metres");
  equal(await oldPage.inputValue("#eye"), "1.7");
  close((await stored(oldPage)).eye, 1.7);
  close((await stored(oldPage)).elev, 2000);
  await oldPage.selectOption("#units", "feet");
  close((await stored(oldPage)).eye, 1.7);
  close((await stored(oldPage)).elev, 2000);
  equal(await mainTimes(oldPage), ["Not read yet", "Not read yet"]);
  console.log("  ok saved metric heights retain their physical values; an unavailable skyline is labelled");

  for (const [lat, lon, zone] of [[31.778, 35.2354, "Asia/Jerusalem"], [45.9237, 6.8694, "Europe/Paris"],
    [-33.8688, 151.2093, "Australia/Sydney"], [21.3069, -157.8583, "Pacific/Honolulu"],
    [40.0959, -74.2176, "America/New_York"]]) {
    await oldPage.evaluate(({ lat, lon }) => {
      document.getElementById("lat").value = lat;
      document.getElementById("lon").value = lon;
      document.getElementById("lat").dispatchEvent(new Event("change", { bubbles: true }));
    }, { lat, lon });
    equal(await oldPage.inputValue("#tz"), zone);
    equal((await stored(oldPage)).tzMode, "auto");
  }
  await oldPage.selectOption("#tz", "UTC");
  await oldPage.reload({ waitUntil: "domcontentloaded" });
  equal(await oldPage.inputValue("#tz"), "UTC");
  equal((await stored(oldPage)).tzMode, "manual");
  await oldPage.locator("#dnext").click();
  await oldPage.locator("#locationControls").evaluate(n => { n.open = true; });
  await oldPage.locator("#settings").evaluate(n => { n.open = true; });
  await oldPage.selectOption("#units", "metres");
  equal(await oldPage.inputValue("#tz"), "UTC");
  await oldPage.locator("#zoneAuto").click();
  equal(await oldPage.inputValue("#tz"), "America/New_York");
  equal((await stored(oldPage)).tzMode, "auto");
  console.log("  ok five location time zones, manual override after refresh, and return to automatic");
  await legacy.close();
  console.log(`\n${checks} units, skyline and time zone checks passed.`);
} finally { await browser.close(); }
