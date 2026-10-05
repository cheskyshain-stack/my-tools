import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";
import { sunEvent } from "../../zmanim-tool/js/zmanim/solar.js";

// Cross-check rendered browser results, not a second copy of the page's functions.
// This reference checkout is required: accuracy must never silently skip it.
const UTC = { utcOffset: 0, dstOffset: 0, rule: "none" };
const places = [
  ["Lakewood", 40.0959, -74.2176], ["Jerusalem", 31.778, 35.2354],
  ["Chamonix", 45.9237, 6.8694], ["Denver", 39.7392, -104.9903],
  ["London", 51.5074, -0.1278], ["Cape Town", -33.9249, 18.4241],
  ["Sydney", -33.8688, 151.2093], ["Tokyo", 35.6762, 139.6503],
  ["Honolulu", 21.3069, -157.8583], ["Reykjavik", 64.1466, -21.9426],
  ["Near date line", -16.5, -179.9]
];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.route("**/elevation-tiles-prod/**", r => r.abort());
await page.goto(`${BASE}/horizon/`, { waitUntil: "domcontentloaded" });
await page.locator("#locationControls").evaluate(n => { n.open = true; });
await page.locator("#settings").evaluate(n => { n.open = true; });
await page.selectOption("#units", "metres");
await page.locator("#comparison").evaluate(n => { n.open = true; });
let checks = 0, maxSea = 0, maxHeight = 0;
async function set(lat, lon, date, elevation = "0", zone = "UTC") {
  await page.evaluate(({ lat, lon, date, elevation, zone }) => {
    for (const [id, value] of Object.entries({ lat, lon, elev: elevation, eye: 0, date, tz: zone })) {
      const input = document.getElementById(id);
      input.value = String(value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { lat, lon, date, elevation, zone });
}
async function text(rise, row) {
  return page.locator(`#${rise ? "riseBox" : "setBox"} .ans .t:not(.head)`).nth(row * 2).innerText();
}
function seconds(clock) {
  const m = /^(\d+):(\d+):(\d+)\s+(AM|PM)/.exec(clock);
  assert.ok(m, "Expected clock reading: " + clock);
  return (+m[1] % 12 + (m[4] === "PM" ? 12 : 0)) * 3600 + +m[2] * 60 + +m[3];
}
function error(a, b) {
  const delta = ((a - b + 43200) % 86400 + 86400) % 86400 - 43200;
  return Math.abs(delta);
}
function reference(rise, date, lat, lon, elevation = 0) {
  return sunEvent(rise, new Date(date + "T00:00:00Z"), 5 / 6,
    { latitude: lat, longitude: lon, elevation, timezone: UTC }, elevation > 0) * 86400;
}
try {
  for (const [name, lat, lon] of places) {
    let placeMax = 0;
    for (let month = 1; month <= 12; month++) {
      const date = `2026-${String(month).padStart(2, "0")}-15`;
      await set(lat, lon, date);
      for (const rise of [true, false]) {
        const delta = error(seconds(await text(rise, 0)), reference(rise, date, lat, lon));
        assert.ok(delta < 1.25, `${name} ${date} ${rise ? "sunrise" : "sunset"}: ${delta}s error`);
        maxSea = Math.max(maxSea, delta); placeMax = Math.max(placeMax, delta); checks++;
      }
    }
    console.log(`  ok ${name}: 24 sea level readings, largest difference ${placeMax.toFixed(3)}s`);
  }
  for (const [name, lat, lon] of places.slice(0, 9)) {
    for (const date of ["2026-03-21", "2026-06-21", "2026-09-21", "2026-12-21"]) {
      await set(lat, lon, date, "1000");
      for (const rise of [true, false]) {
        const delta = error(seconds(await text(rise, 1)), reference(rise, date, lat, lon, 1000));
        // The reference uses an earth radius of 6356.9km; Horizon uses the mean
        // radius of 6371.0088km. Allow that difference and the displayed second.
        assert.ok(delta < 2.5, `${name} ${date} elevated time: ${delta}s error`);
        maxHeight = Math.max(maxHeight, delta); checks++;
      }
    }
  }
  console.log(`  ok 72 elevated readings, largest difference ${maxHeight.toFixed(3)}s`);

  for (const [zone, lat, lon] of [["America/New_York", 40.0959, -74.2176], ["Asia/Jerusalem", 31.778, 35.2354]]) {
    for (const date of ["2026-03-07", "2026-03-08", "2026-03-26", "2026-03-27", "2026-10-24", "2026-10-25", "2026-10-31", "2026-11-01"]) {
      await set(lat, lon, date, "0", zone);
      for (const rise of [true, false]) {
        const instant = new Date(new Date(date + "T00:00:00Z").getTime() + reference(rise, date, lat, lon) * 1000);
        const expected = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: zone }).format(instant);
        assert.ok(error(seconds(await text(rise, 0)), seconds(expected)) <= 1, `${zone} ${date} daylight saving mismatch`);
        checks++;
      }
    }
  }
  console.log("  ok 32 readings across US and Israel daylight saving transitions");

  await set(65, 0, "2026-06-01", "5000");
  assert.match(await text(true, 0), /AM/);
  assert.match(await text(true, 1), /No crossing/);
  assert.match(await text(false, 1), /No crossing/);
  checks += 3;
  for (const date of ["2026-06-21", "2026-12-21"]) {
    await set(69.6492, 18.9553, date);
    assert.match(await text(true, 0), /No crossing/);
    assert.match(await text(false, 0), /No crossing/);
    checks += 2;
  }
  // At altitude a crossing can exist even when sea level has none.
  await set(69, 0, "2026-12-21", "5000");
  assert.match(await text(true, 0), /No crossing/);
  assert.match(await text(true, 1), /AM/);
  checks += 2;
  console.log("  ok polar day, polar night and high elevation without crashing");

  await set(40.0959, -74.2176, "2026-09-30");
  const saved = await page.evaluate(() => localStorage.getItem("cjHorizonV1"));
  for (const lat of ["", "91", "-91"]) {
    await set(lat, -74.2176, "2026-09-30");
    assert.equal(await page.locator("#inputError").isVisible(), true);
    assert.equal(await page.locator("#run").isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("cjHorizonV1")), saved);
    checks += 3;
  }
  await set(40.0959, 181, "2026-09-30");
  assert.equal(await page.locator("#inputError").isVisible(), true); checks++;
  await set(40.0959, -74.2176, "2026-09-30");
  assert.equal(await page.locator("#inputError").isVisible(), false); checks++;
  await page.clock.install({ time: new Date("2026-10-05T00:30:00Z") });
  for (const [zone, expected] of [["America/Los_Angeles", "2026-10-04"], ["Asia/Tokyo", "2026-10-05"]]) {
    await page.selectOption("#tz", zone);
    await page.locator("#today").click();
    assert.equal(await page.inputValue("#date"), expected); checks++;
  }
  assert.deepEqual(errors, []); checks++;
  console.log(`\n${checks} accuracy and input checks passed. Maximum sea level difference: ${maxSea.toFixed(3)}s.`);
} finally { await browser.close(); }
