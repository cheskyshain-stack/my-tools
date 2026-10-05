import { tileBytes } from "./tiles.mjs";
import { launch, BASE } from "./pw.mjs";

const APP = `${BASE}/horizon/`;
let pass = 0, fail = 0;
const check = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++;
  console.log(`${ok ? "  ok " : "FAIL "} ${n}` + (ok ? "" : `\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = Math.abs(g - w) <= tol; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok " : "FAIL "} ${n}` + (ok ? ` (${g})` : `\n        got  ${g}\n        want ${w} +- ${tol}`)); };



/* The real Nominatim is blocked from this container, so its ANSWER is stubbed with a
   real response body. That tests the parsing, the list and the pick, and does not test
   that the live service is reachable: only a real browser can say that. */
const NOMINATIM = [
  { lat: "40.0763412", lon: "-74.2096093",
    display_name: "44, Coles Way, Lakewood, Ocean County, New Jersey, 08701, United States" },
  { lat: "40.0959", lon: "-74.2176",
    display_name: "Lakewood Township, Ocean County, New Jersey, United States" }
];

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
await ctx.route("**/elevation-tiles-prod/**", async route => {
  const body = await tileBytes(route.request().url());
  route.fulfill(body
    ? { status: 200, contentType: "image/png", body, headers: { "Access-Control-Allow-Origin": "*" } }
    : { status: 404, body: "" });
});
let asked = null;
await ctx.route("**/nominatim.openstreetmap.org/**", route => {
  asked = route.request().url();
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(NOMINATIM),
    headers: { "Access-Control-Allow-Origin": "*" } });
});
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", e => errs.push(String(e)));
pg.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
await pg.goto(APP, { waitUntil: "domcontentloaded" });
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
await pg.selectOption("#tz", "UTC");
await pg.waitForTimeout(200);

/* ---------- 1. it can find you ---------- */
await ctx.grantPermissions(["geolocation"]);
await ctx.setGeolocation({ latitude: 31.7780, longitude: 35.2354 });
await pg.click("#gps");
await pg.waitForFunction(() => document.getElementById("lat").value.startsWith("31.778"), null, { timeout: 15000 });
check("Use my location fills in where you are",
  [await pg.inputValue("#lat"), await pg.inputValue("#lon")], ["31.77800", "35.23540"]);

/* ---------- 2. an address ---------- */
await pg.fill("#addr", "44 Coles Way, Lakewood NJ");
await pg.press("#addr", "Enter");
await pg.waitForSelector(".hit", { timeout: 15000 });
check("it asked the geocoder for what was typed",
  decodeURIComponent(asked).includes("q=44 Coles Way, Lakewood NJ"), true);
check("both answers are offered", await pg.$$eval(".hit", n => n.length), 2);
check("the first reads as a street address",
  (await pg.$$eval(".hit", n => n.map(x => x.firstChild.textContent)))[0], "44, Coles Way, Lakewood");
await pg.click('.hit[data-hit="0"]');
await pg.waitForTimeout(300);
check("picking one moves the location",
  [await pg.inputValue("#lat"), await pg.inputValue("#lon")], ["40.07634", "-74.20961"]);
check("and it says which one it took",
  /Showing 44, Coles Way, Lakewood/.test(await pg.$eval("#hits", n => n.textContent)), true);

/* a lookup that will not run has to say so rather than look broken */
await ctx.unroute("**/nominatim.openstreetmap.org/**");
await ctx.route("**/nominatim.openstreetmap.org/**", route => route.abort());
await pg.fill("#addr", "nowhere at all");
await pg.press("#addr", "Enter");
await pg.waitForFunction(() => /still work/.test(document.getElementById("hits").textContent), null, { timeout: 15000 });
check("a failed lookup points back at the coordinates",
  /Could not reach the address lookup/.test(await pg.$eval("#hits", n => n.textContent)), true);
check("and the Find button comes back", await pg.$eval("#find", n => n.disabled), false);

/* ---------- 3. the spot that blocks the sun ---------- */
for (const [id, v] of [["lat", "45.9237"], ["lon", "6.8694"], ["elev", ""]]) {
  await pg.fill("#" + id, v); await pg.dispatchEvent("#" + id, "change");
}
await pg.fill("#date", "2026-09-30"); await pg.dispatchEvent("#date", "change");
await pg.waitForTimeout(250);
await pg.click("#run");
await pg.waitForFunction(() => document.getElementById("run").textContent === "Read again", null, { timeout: 240000 });
await pg.waitForTimeout(400);

const spot = await pg.evaluate(() => {
  const card = document.querySelector(".spot-card");
  const a = card.querySelector("a");
  const u = new URL(a.href);
  const q = u.searchParams.get("query").split(",").map(Number);
  return { head: card.querySelector("h3").textContent, text: card.querySelector("p").textContent,
           host: u.host, path: u.pathname, lat: q[0], lon: q[1],
           target: a.target, rel: a.rel };
});
console.log("   spot card:", spot.head, "|", spot.text.replace(/\s+/g, " "));
check("the card names what the sun goes behind", spot.head, "The ground the sun goes behind");
check("it links to Google Maps", [spot.host, spot.path], ["www.google.com", "/maps/search/"]);
check("the pin opens in a new tab safely", [spot.target, spot.rel], ["_blank", "noopener"]);
near("the pin is beside the observer in the Alps", spot.lat, 45.92, 0.06);
near("and west of it, where the sun was setting", spot.lon, 6.84, 0.06);

/* the pin has to be the ground the solver actually used, not a neighbouring ray */
const agree = await pg.evaluate(() => {
  const txt = document.querySelector(".spot-card p").textContent;
  const up = /standing ([\d.-]+)/.exec(txt);
  const note = document.getElementById("skyNote").textContent;
  const used = /stands (-?[\d.]+) degrees/.exec(note);
  return { pin: Number(up[1]), solver: Number(used[1]) };
});
console.log("   pin says", agree.pin, "deg, solver used", agree.solver, "deg");
check("the pin's height matches the horizon the solver used", Math.abs(agree.pin - agree.solver) < 0.05, true);

/* and it follows the sunrise/sunset switch */
await pg.click('#skyWho [data-sky="rise"]');
await pg.waitForTimeout(300);
const east = await pg.evaluate(() => {
  const c = document.querySelector(".spot-card");
  return { head: c.querySelector("h3").textContent,
           lon: Number(new URL(c.querySelector("a").href).searchParams.get("query").split(",")[1]) };
});
check("sunrise names the ground the sun comes over", east.head, "The ground the sun comes over");
check("and its pin is east of the sunset one", east.lon > spot.lon, true);
console.log("   sunrise pin lon", east.lon, "vs sunset", spot.lon);

/* ---------- 4. the explainer is a dropdown ---------- */
check("the explainer starts closed", await pg.$eval("#about", n => n.open), false);
// measured on the card, which is what the reader sees take up the screen: a closed
// details still reports a box for its hidden content in Chromium
const shutH = await pg.$eval(".note", n => n.getBoundingClientRect().height);
await pg.click("#about summary");
await pg.waitForTimeout(250);
check("it opens on a tap", await pg.$eval("#about", n => n.open), true);
const openH = await pg.$eval(".note", n => n.getBoundingClientRect().height);
console.log("   explainer card:", Math.round(shutH), "px shut,", Math.round(openH), "px open");
check("shut, it is one line rather than a page", shutH < 90, true);
check("and opening it is what costs the room", openH > shutH + 300, true);
check("why the spot is close is explained in it",
  /earth curving away/.test(await pg.$eval("#about", n => n.textContent)), true);
check("and the note no longer calls it the highest ground",
  /not the same as the highest ground/.test(await pg.$eval("#skyNote", n => n.textContent)), true);
check("skyline is explained in it",
  /Skyline here means the outline of the ground around you/.test(await pg.$eval("#about", n => n.textContent)), true);

/* ---------- housekeeping ---------- */
check("no sideways overflow at 393px",
  await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
check("no em dash on the page", await pg.evaluate(() => document.body.innerText.indexOf("—")), -1);
/* ground right at your feet is flagged, since that is where the map is weakest */
await pg.fill("#lat","40.0959"); await pg.dispatchEvent("#lat","change");
await pg.fill("#lon","-74.2176"); await pg.dispatchEvent("#lon","change");
await pg.fill("#eye","0"); await pg.dispatchEvent("#eye","change");
await pg.waitForTimeout(500);
await pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",
  null,{timeout:240000});
await pg.waitForTimeout(400);
await pg.click('#skyWho [data-sky="set"]');     // the card follows this switch
await pg.waitForTimeout(300);
const near0 = await pg.$eval(".spot-card", n=>n.textContent);
console.log("   card:", near0.replace(/\s+/g," ").slice(0,150));
check("ground within 300 m is flagged as the map's weakest answer",
  /within \d+ m of you/.test(near0), true);
check("and it says why", /no buildings and no trees/.test(near0), true);

check("no console errors", errs, []);

/* ---------- 5. the clock reads am and pm ---------- */
const reads = await pg.$$eval("#setBox .ans .t:not(.head)",
  n => n.map(x => x.childNodes[0].textContent.trim()).filter((_, i) => i % 2 === 0));
console.log("   sunset column:", JSON.stringify(reads));
check("every time is twelve hour with a suffix",
  reads.every(t => /^\d{1,2}:\d{2}:\d{2} (AM|PM)$/.test(t)), true);
check("no hour above twelve survives", reads.every(t => Number(t.split(":")[0]) <= 12), true);
check("and none is a bare zero hour", reads.every(t => Number(t.split(":")[0]) >= 1), true);
check("no invisible space crept in front of the suffix",
  reads.some(t => /[\u202F\u00A0]/.test(t)), false);
// the am/pm has to be right, not just present: this is a Chamonix sunset
check("the sunset column is afternoon", reads.every(t => /PM$/.test(t)), true);
const morning = await pg.$$eval("#riseBox .ans .t:not(.head)",
  n => n.map(x => x.childNodes[0].textContent.trim()).filter((_, i) => i % 2 === 0));
console.log("   sunrise column:", JSON.stringify(morning));
check("and the sunrise column is morning", morning.every(t => /AM$/.test(t)), true);
check("the times still fit their column",
  await pg.evaluate(() => [...document.querySelectorAll("#setBox .ans .t:not(.head)")]
    .every(c => c.scrollWidth <= c.clientWidth + 1)), true);

await pg.locator("#skyCard").scrollIntoViewIfNeeded();
await pg.waitForTimeout(250);
await pg.screenshot({ path: "feat-spot.png" });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
