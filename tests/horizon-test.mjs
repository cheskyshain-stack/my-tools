import { launch } from "./pw.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
import fs from "node:fs";
/* The sea level row is cross-checked against the shul's own NOAA engine, which is
   ported 1:1 from the workbook the boards are printed from. That repo sits beside this
   one when it is checked out; without it those four assertions are skipped rather than
   failing, and the rest of the suite still runs. */
let sunEvent = null;
try { ({ sunEvent } = await import("../../zmanim-tool/js/zmanim/solar.js")); }
catch { console.log("   (zmanim-tool not beside this repo: skipping the solar cross-check)"); }

const APP = "http://127.0.0.1:8099/horizon/";
let pass = 0, fail = 0;
const check = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++;
  console.log(`${ok ? "  ok " : "FAIL "} ${n}` + (ok ? "" : `\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = Math.abs(g - w) <= tol; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok " : "FAIL "} ${n}` + (ok ? ` (${g}, within ${tol} of ${w})` : `\n        got  ${g}\n        want ${w} +- ${tol}`)); };

/* Real tiles, fetched with curl because only curl gets out of this container.
   The page itself is untouched: it asks AWS exactly as it would in a browser. */
fs.mkdirSync("tiles", { recursive: true });
let fetched = 0, served = 0;
/* async, not execFileSync: a synchronous curl inside a route handler blocks Node's
   own event loop, which is also Playwright's, and the page hangs waiting for a tile
   that is waiting for the loop. */
async function tileBytes(z, x, y) {
  const p = `tiles/${z}_${x}_${y}.png`;
  if (!fs.existsSync(p)) {
    try {
      await run("curl", ["-s", "-f", "-m", "60", "-o", p,
        `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`]);
      fetched++;
    } catch (e) { fs.writeFileSync(p, ""); }
  }
  const b = fs.readFileSync(p);
  return b.length ? b : null;
}

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
await ctx.route("**/elevation-tiles-prod/**", async route => {
  const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url());
  if (!m) return route.abort();
  const body = await tileBytes(+m[1], +m[2], +m[3]);
  served++;
  if (!body) return route.fulfill({ status: 404, body: "" });
  route.fulfill({ status: 200, contentType: "image/png", body,
    headers: { "Access-Control-Allow-Origin": "*" } });
});
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", e => errs.push(String(e)));
pg.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });

await pg.goto(APP, { waitUntil: "domcontentloaded" });
await pg.waitForTimeout(400);
await pg.selectOption("#tz", "UTC");
await pg.waitForTimeout(250);

const setAt = async (lat, lon, date) => {
  await pg.fill("#lat", String(lat));
  await pg.dispatchEvent("#lat", "change");
  await pg.fill("#lon", String(lon));
  await pg.dispatchEvent("#lon", "change");
  await pg.fill("#elev", "");
  await pg.dispatchEvent("#elev", "change");
  await pg.fill("#date", date);
  await pg.dispatchEvent("#date", "change");
  await pg.waitForTimeout(250);
};
// the grid alternates time cell, shift cell, so the times are the even ones
const times = box => pg.$$eval(`#${box} .ans .t:not(.head)`, n => n.map(x => x.childNodes[0].textContent.trim()).filter((_, i) => i % 2 === 0));
const labels = box => pg.$$eval(`#${box} .ans .lbl b`, n => n.map(x => x.textContent));

/* ---------- the sea level row must agree with the shul's own engine ---------- */
const UTC = { utcOffset: 0, dstOffset: 0, rule: "none" };
const ref = (lat, lon, y, m, d, rise) => {
  const f = sunEvent(rise, new Date(Date.UTC(y, m - 1, d)), 5 / 6, { latitude: lat, longitude: lon, elevation: 0, timezone: UTC }, false);
  return f * 1440;                                     // minutes into the UTC day
};
/* "5:14:50 PM" into minutes since midnight. The page went to a twelve hour clock, so
   the hour has to be folded back round and the suffix read rather than ignored. */
const mins = txt => {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(txt.trim());
  if (!m) throw new Error("not a clock reading: " + JSON.stringify(txt));
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[4])) h += 12;
  return h * 60 + Number(m[2]) + Number(m[3]) / 60;
};

await setAt(40.0959, -74.2176, "2026-09-30");
let set = await times("setBox"), rise = await times("riseBox");
check("three rows on each", [rise.length, set.length], [3, 3]);
check("the rows are labelled", await labels("setBox"), ["Sea level", "Your height", "Real skyline"]);
if (sunEvent) near("Lakewood sea level sunset matches solar.js", mins(set[0]), ref(40.0959, -74.2176, 2026, 9, 30, false), 0.25);
if (sunEvent) near("Lakewood sea level sunrise matches solar.js", mins(rise[0]), ref(40.0959, -74.2176, 2026, 9, 30, true), 0.25);

await setAt(31.7780, 35.2354, "2026-06-21");
set = await times("setBox");
if (sunEvent) near("Jerusalem midsummer sunset matches solar.js", mins(set[0]), ref(31.7780, 35.2354, 2026, 6, 21, false), 0.25);

await setAt(45.9237, 6.8694, "2026-12-21");
set = await times("setBox");
if (sunEvent) near("Chamonix midwinter sunset matches solar.js", mins(set[0]), ref(45.9237, 6.8694, 2026, 12, 21, false), 0.25);

/* ---------- elevation pushes sunset later and sunrise earlier ---------- */
await setAt(40.0959, -74.2176, "2026-09-30");
/* Let the reading finish before touching the height. Typing into a box while a
   reading is in flight is its own question, and auto-test asks it deliberately
   with a slowed network rather than leaving it to whoever wins a race here. */
await pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",
  null, {timeout: 240000});
await pg.fill("#elev", "1000"); await pg.dispatchEvent("#elev", "change");
/* The change schedules a reading of its own, so the row is read once that has been
   and gone. Asserting inside that window is a race with the page rather than a
   test of it: auto-test asks the mid-reading question deliberately instead. */
await pg.waitForTimeout(450);
await pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",
  null, {timeout: 240000});
await pg.waitForTimeout(250);
set = await times("setBox"); rise = await times("riseBox");
/* dip at 1000 m is 1.014 deg, and at Lakewood the sun drops 15 deg an hour times
   cos(40), so 1.014 / (15 * 0.766) hours = 5.3 min. Checked against that, not guessed. */
near("1000 m delays sunset by 5.3 min", mins(set[1]) - mins(set[0]), 5.30, 0.15);
near("1000 m brings sunrise forward by the same", mins(rise[0]) - mins(rise[1]), 5.30, 0.15);
check("the base row shows no shift", (await pg.$$eval("#setBox .ans .t.base small", n => n.map(x => x.textContent)))[0], "0");

/* ---------- the terrain read ---------- */
await setAt(45.9237, 6.8694, "2026-09-30");
await pg.click("#run");
await pg.waitForFunction(() => document.getElementById("run").textContent === "Read again", null, { timeout: 180000 });
await pg.waitForTimeout(400);
set = await times("setBox");
const chamonix = mins(set[0]) - mins(set[2]);
/* Not the 2h46m the worst bearing alone would give: the sun sets at 253 deg on this
   date, where the ridge is 12 deg, not at 295 deg where it is 27. That the answer is
   the smaller one is the whole point of solving bearing and time together, and the
   number moved from 97 to 73 the moment the two were solved as one equation. */
near("Chamonix loses an hour and a quarter to the mountains", chamonix, 72.9, 8);
const sky = await pg.$eval("#skyNote", n => n.textContent);
check("and it solved at the sunset bearing, not the worst one", /at 2[45][0-9] degrees/.test(sky), true);
const onRidge = await pg.evaluate(() => {
  // the sun marker and the drawn ground must meet: read both back off the SVG
  const dot = document.querySelector("#sky circle");
  const path = document.querySelector("#sky path");           // the ground
  const x = +dot.getAttribute("cx"), y = +dot.getAttribute("cy");
  const pts = path.getAttribute("d").match(/-?\d+\.?\d*/g).map(Number);
  let best = 1e9, gy = null;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const d = Math.abs(pts[i] - x);
    if (d < best) { best = d; gy = pts[i + 1]; }
  }
  return { dotY: y, groundY: gy, apart: Math.abs(y - gy) };
});
console.log("   marker vs ground, in svg px:", JSON.stringify(onRidge));
check("the marker sits on the skyline it set behind", onRidge.apart < 3, true);
check("the skyline card is showing", await pg.$eval("#skyCard", n => getComputedStyle(n).display !== "none"), true);
check("the skyline is drawn", await pg.$$eval("#sky path", n => n.length), 2);
console.log("   tiles served to the page:", served, "| downloaded:", fetched);
console.log("   Chamonix sunset note:", await pg.$eval("#skyNote", n => n.textContent));

/* sunrise must use the EASTERN ground. Reading the western window and clamping put a
   ridge behind the observer onto netz and moved it 24 minutes the wrong way. */
rise = await times("riseBox");
const riseShift = mins(rise[0]) - mins(rise[2]);
check("sunrise is later behind the eastern ridge, not earlier", riseShift < 0, true);
/* A 3550 m wall 4.6 km away stands 28 degrees up, and the sun does not clear it until
   mid morning. Three hours late is what a Chamonix September actually looks like. */
near("Chamonix netz is three hours late behind the Aiguilles", -riseShift, 180, 15);
const riseAzTxt = await pg.$$eval("#riseBox .ans .lbl span", n => n[2].textContent);
check("and it is an eastern bearing", /at (0?[5-9][0-9]|1[0-4][0-9])\u00B0/.test(riseAzTxt), true);
// the answer has to land inside the ground that was actually read, or it is the
// window's edge talking rather than the mountain
check("the sunrise answer is inside the patch read", /beyond the patch/.test(riseAzTxt), false);
check("and so is the sunset one",
  /beyond the patch/.test(await pg.$$eval("#setBox .ans .lbl span", n => n[2].textContent)), false);
console.log("   Chamonix sunrise row:", riseAzTxt);

await pg.click('#skyWho [data-sky="rise"]');
await pg.waitForTimeout(250);
const east = await pg.$eval("#skyNote", n => n.textContent);
check("the chart can show the eastern half", /clears the ground/.test(east), true);
console.log("   Chamonix sunrise note:", east);
await pg.click('#skyWho [data-sky="set"]');
await pg.waitForTimeout(200);

await pg.screenshot({ path: "horizon-chamonix.png", fullPage: false });

/* ---------- and the flat case, where it should do almost nothing ---------- */
await setAt(40.0959, -74.2176, "2026-09-30");
await pg.click("#run");
await pg.waitForFunction(() => document.getElementById("run").textContent === "Read again", null, { timeout: 180000 });
await pg.waitForTimeout(400);
set = await times("setBox");
const lakewood = mins(set[0]) - mins(set[2]);
/* At 1.7 m the sun sets behind the 44 m rise 3 km out and Lakewood barely moves,
   which is the flat country claim worth holding on to. At the shipped default of 0
   the blocker is instead a 1.6 m rise 90 m away and the answer is 6.4 minutes, which
   is checked below: that sensitivity is real and is why the card warns about it. */
await pg.fill("#eye", "1.7"); await pg.dispatchEvent("#eye", "change");
await pg.waitForTimeout(450);
await pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",
  null, {timeout: 240000});
await pg.waitForTimeout(250);
set = await times("setBox");
const lakewoodUp = mins(set[0]) - mins(set[2]);
near("Lakewood barely moves once you are standing", lakewoodUp, 1.6, 0.5);
near("but on the ground itself it is the bump next door", lakewood, 6.4, 1.2);
const close = await pg.evaluate(()=>{
  const c = document.querySelector(".spot-card"); return c ? c.textContent : "";
});
check("and at 1.7 m nothing is close enough to warn about", /within \d+ m of you/.test(close), false);
check("Lakewood still moves the right way (earlier)", lakewood > 0, true);
console.log("   Lakewood note:", await pg.$eval("#skyNote", n => n.textContent));
await pg.screenshot({ path: "horizon-lakewood.png", fullPage: false });

/* ---------- housekeeping ---------- */
check("no sideways overflow at 393px",
  await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
check("no console errors", errs, []);
check("no em dash anywhere on the page",
  await pg.evaluate(() => document.body.innerText.indexOf("—")), -1);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
