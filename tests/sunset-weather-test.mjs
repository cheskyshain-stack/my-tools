import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";
import { sunEvent } from "../../zmanim-tool/js/zmanim/solar.js";

const browser = await launch();
const NOW = Date.parse("2026-11-02T15:00:00Z");
const levels = [1000,975,950,925,900,875,850,800,750,700,650,600,550,500,450,400,350,300,250,200,150,100,70,50,30,20,10];
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const ok = (a, reason) => { assert.ok(a, reason); checks++; };
function reading() {
  const current = { time: NOW / 1000, interval: 900, temperature_2m: 15, pressure_msl: 1013.25 };
  const current_units = { time: "unixtime", interval: "seconds", temperature_2m: "°C", pressure_msl: "hPa" };
  for (const p of levels) {
    const h = p >= 226.3213 ? 44330.77 * (1 - (p / 1013.25) ** .190263) : 11000 - 6341.62 * Math.log(p / 226.3213);
    current[`temperature_${p}hPa`] = p >= 226.3213 ? 15 - .0065 * h : -56.5;
    current[`geopotential_height_${p}hPa`] = h;
    current_units[`temperature_${p}hPa`] = "°C";
    current_units[`geopotential_height_${p}hPa`] = "m";
  }
  return { elevation: 0, current, current_units };
}
let places = [{ display_name: "Lakewood, Ocean County, New Jersey, 08701, United States", lat: "40.0959", lon: "-74.2176" }];
let mode = "good", requests = [], lookupQueries = [], release = null;
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, permissions: ["geolocation"], geolocation: { latitude: 31.778, longitude: 35.2354 } });
await ctx.route("**/nominatim.openstreetmap.org/**", async r => {
  lookupQueries.push(new URL(r.request().url()).searchParams.get("q"));
  await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(places) });
});
await ctx.route("**/api.open-meteo.com/**", async r => {
  const url = new URL(r.request().url()); requests.push(url);
  const chosen = mode;
  if (chosen === "slow") await new Promise(resolve => { release = resolve; });
  if (chosen === "error") return r.fulfill({ status: 503, body: "Service unavailable" });
  const data = Array.from({ length: 8 }, reading);
  const lons = url.searchParams.get("longitude").split(",").map(Number);
  const east = ((lons[1] - lons[0] + 540) % 360) - 180 > 0;
  if (chosen === "missing" || chosen === "eastmissing" && east) data[4].current.temperature_500hPa = null;
  if (chosen === "stale") for (const d of data) d.current.time -= 14400;
  if (chosen === "inconsistent") data[3].current.time -= 900;
  if (chosen === "badpressure") data[0].current.pressure_msl = -1;
  if (chosen === "warmremote") for (let i = 1; i < 8; i++) for (const p of levels) data[i].current[`temperature_${p}hPa`] += 15;
  await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*503/.test(m.text())) errors.push(m.text()); });
await page.clock.install({ time: new Date(NOW) });
const settled = () => page.waitForFunction(() => !document.getElementById("refresh").disabled, null, { timeout: 30000 });
const utc = id => page.locator(id).getAttribute("data-utc").then(Number);
async function select(query, target = places[0]) {
  places = [target]; await page.fill("#query", query); await page.locator("#find").click();
  await page.locator(".hit").click(); await settled();
}
try {
  await page.goto(`${BASE}/sunset-weather/`, { waitUntil: "domcontentloaded" });
  eq(await page.locator("#standard").innerText(), "Choose a location");
  eq(requests.length, 0);
  await select("08701");
  eq(lookupQueries[0], "08701");
  ok((await page.locator("#placeName").innerText()).includes("08701"));
  ok((await page.locator("#adjusted").innerText()).includes("PM"));
  ok((await page.locator("#riseAdjusted").innerText()).includes("AM"));
  eq(await page.locator("#riseDifference").getAttribute("data-seconds"), String(((await utc("#riseAdjusted")) - (await utc("#riseStandard"))) / 1000));
  ok(requests.some(u => +u.searchParams.get("longitude").split(",")[1] > +u.searchParams.get("longitude").split(",")[0]), "sunrise requests weather east of the observer");
  ok(requests.some(u => +u.searchParams.get("longitude").split(",")[1] < +u.searchParams.get("longitude").split(",")[0]), "sunset requests weather west of the observer");
  ok((await page.locator("#temperature").innerText()).includes("59.0°F"));
  ok((await page.locator("#pressure").innerText()).includes("1013.3 hPa"));
  ok((await page.locator("#weatherSource").innerText()).includes("NOAA GFS"));
  eq(await page.locator("#readingTime").getAttribute("datetime"), new Date(NOW).toISOString());
  const fetched = Date.parse(await page.locator("#fetchedTime").getAttribute("datetime"));
  ok(fetched >= NOW && fetched < NOW + 120000, "last fetched is a retrieval instant, distinct from weather valid time");
  const first = requests[0];
  eq(first.pathname, "/v1/gfs");
  eq(first.searchParams.get("elevation"), "0,0,0,0,0,0,0,0");
  eq(first.searchParams.get("latitude").split(",").length, 8);
  eq(first.searchParams.get("models"), "gfs_global");
  ok(first.searchParams.get("current").includes("temperature_10hPa"));
  ok(first.searchParams.get("current").includes("geopotential_height_1000hPa"));
  eq(await page.locator("#difference").getAttribute("data-seconds"), String(((await utc("#adjusted")) - (await utc("#standard"))) / 1000));
  await page.locator("#profileDetails > summary").click();
  eq(await page.locator("#profilePoint option").count(), 8);
  ok(await page.locator("#profileRows tr").count() > 20);
  await page.selectOption("#profilePoint", "7");
  eq(await page.locator("#profilePoint").inputValue(), "7");
  const baseline = await utc("#adjusted");
  const riseBaseline = await utc("#riseAdjusted");
  mode = "warmremote"; await page.locator("#refresh").click(); await settled();
  ok(Math.abs((await utc("#adjusted")) - baseline) >= 1000, "distant air layers affect the shown sunset with identical local weather");
  ok((await utc("#riseAdjusted")) < riseBaseline, "stronger refraction brings sunrise earlier");
  ok((await utc("#adjusted")) > baseline, "stronger refraction pushes sunset later");
  mode = "eastmissing"; await page.locator("#refresh").click(); await settled();
  eq(await page.locator("#riseAdjusted").innerText(), "Unavailable");
  ok((await page.locator("#adjusted").innerText()).includes("PM"), "missing eastern layers do not discard the western result");
  await page.locator('[data-side="rise"]').click();
  ok((await page.locator("#weatherStatus").innerText()).includes("unavailable"));
  await page.locator('[data-side="set"]').click();
  ok(!(await page.locator("#weatherStatus").innerText()).includes("unavailable"));
  mode = "good";
  await select("350 Fifth Avenue, New York", { display_name: "350, Fifth Avenue, New York, United States", lat: "40.7484", lon: "-73.9857" });
  eq(lookupQueries.at(-1), "350 Fifth Avenue, New York");
  ok((await page.locator("#placeName").innerText()).startsWith("350"));
  await page.locator("#gps").click();
  await page.waitForFunction(() => document.getElementById("placeName").textContent.startsWith("My location"));
  await settled();
  ok((await page.locator("#placeName").innerText()).startsWith("My location"));
  ok((await page.locator("#zoneLabel").innerText()).includes("Asia/Jerusalem"));
  await page.fill("#date", "2027-03-10"); await page.dispatchEvent("#date", "change"); await settled();
  ok((await page.locator("#dateNotice").innerText()).includes("not historical weather or a forecast"));
  await page.reload({ waitUntil: "domcontentloaded" }); await settled();
  eq(await page.inputValue("#date"), "2027-03-10");
  ok((await page.locator("#placeName").innerText()).startsWith("My location"));
  for (const value of ["missing", "stale", "inconsistent", "badpressure", "error"]) {
    mode = value; await page.locator("#refresh").click(); await settled();
    eq(await page.locator("#adjusted").innerText(), "Unavailable");
    eq(await page.locator("#difference").innerText(), "Unavailable");
    ok(/\d+:\d+:\d+/.test(await page.locator("#standard").innerText()));
    ok((await page.locator("#weatherStatus").innerText()).includes("unavailable"));
  }
  mode = "good"; await page.locator("#refresh").click(); await settled();
  await page.fill("#date", ""); await page.dispatchEvent("#date", "change");
  eq(await page.locator("#inputError").isVisible(), true);
  eq(await page.locator("#standard").innerText(), "Choose a date");
  await page.locator("#today").click(); await settled();
  eq(await page.inputValue("#date"), "2026-11-02");

  // Cross-check rendered sea-level events against the independent workbook engine.
  const UTC = { utcOffset: 0, dstOffset: 0, rule: "none" };
  for (const [name, lat, lon] of [["Lakewood",40.0959,-74.2176],["Jerusalem",31.778,35.2354],["Sydney",-33.8688,151.2093],["London",51.5074,-.1278],["Cape Town",-33.9249,18.4241],["Honolulu",21.3069,-157.8583]]) {
    await select(name, { display_name: name, lat: String(lat), lon: String(lon) });
    for (const date of ["2026-03-08", "2026-06-21", "2026-10-25", "2026-11-01"]) {
      await page.fill("#date", date); await page.dispatchEvent("#date", "change");
      const got = (await utc("#standard")) / 1000;
      const ref = Date.parse(date + "T00:00:00Z") / 1000 + sunEvent(false, new Date(date + "T00:00:00Z"), 5/6, { latitude:lat, longitude:lon, elevation:0, timezone:UTC }, false) * 86400;
      const delta = Math.abs(((got - ref + 43200) % 86400 + 86400) % 86400 - 43200);
      ok(delta < 1.6, `${name} ${date}: ${delta}s from the reference`);
      const riseGot = (await utc("#riseStandard")) / 1000;
      const riseRef = Date.parse(date + "T00:00:00Z") / 1000 + sunEvent(true, new Date(date + "T00:00:00Z"), 5/6, { latitude:lat, longitude:lon, elevation:0, timezone:UTC }, false) * 86400;
      const riseDelta = Math.abs(((riseGot - riseRef + 43200) % 86400 + 86400) % 86400 - 43200);
      ok(riseDelta < 1.6, `${name} ${date} sunrise: ${riseDelta}s from reference`);
    }
  }
  await settled();
  await select("Kiritimati", { display_name: "Kiritimati", lat: "1.8721", lon: "-157.4278" });
  await page.locator("#today").click(); await settled();
  eq(await page.inputValue("#date"), "2026-11-03");
  const local = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(Number(document.getElementById("standard").dataset.utc))));
  eq(local, "2026-11-03");
  const riseLocal = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(Number(document.getElementById("riseStandard").dataset.utc))));
  eq(riseLocal, "2026-11-03");
  await select("Tromso", { display_name: "Tromso", lat: "69.6492", lon: "18.9553" });
  await page.fill("#date", "2026-06-21"); await page.dispatchEvent("#date", "change"); await settled();
  eq(await page.locator("#standard").innerText(), "No sunset");
  eq(await page.locator("#riseStandard").innerText(), "No sunrise");
  eq(await page.locator("#difference").innerText(), "Unavailable");

  await select("Lakewood", { display_name: "Lakewood, New Jersey", lat: "40.0959", lon: "-74.2176" });
  await page.locator("#today").click(); await settled();
  for (const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]) {
    await page.setViewportSize({width,height});
    eq(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
    eq(await page.locator(".time").evaluateAll(ns => ns.filter(n=>n.scrollWidth>n.clientWidth+1).length), 0);
    await page.locator("#profileDetails").evaluate(n=>{n.open=true;});
    eq(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
    for (const side of ["rise", "set"]) {
      await page.locator(`[data-side="${side}"]`).click();
      eq(await page.locator(`[data-side="${side}"]`).getAttribute("aria-pressed"), "true");
      ok((await page.locator("#pathSummary").innerText()).includes(side === "rise" ? "toward sunrise" : "toward sunset"));
      eq(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
    }
    await page.screenshot({path:`sunset-weather-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:393,height:852});
  await page.goto(`${BASE}/`,{waitUntil:"domcontentloaded"});
  const home=page.frameLocator("#shellFrame"); await home.locator('.tab[data-page="1"]').click();
  eq(await home.locator(".hidden-tool:visible").count(),0);
  await home.locator('a.tool[href="/sunset-weather/"]').click(); await page.waitForURL(`${BASE}/sunset-weather/`);
  const frame=page.frames().find(f=>f!==page.mainFrame()&&/\/sunset-weather\//.test(f.url())); ok(frame);
  await frame.waitForFunction(()=>!document.getElementById("refresh").disabled);
  ok((await frame.locator("#adjusted").innerText()).includes("PM"));
  ok((await frame.locator("#riseAdjusted").innerText()).includes("AM"));
  eq(await frame.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await page.goBack(); await page.waitForURL(`${BASE}/`);
  await page.goForward(); await page.waitForURL(`${BASE}/sunset-weather/`);
  eq(await page.locator("#shellFrame").count(),1);
  eq(errors,[]);
  console.log(`${checks} sunset weather browser, solar, date, error, layout and portal checks passed.`);
} finally { await ctx.close(); await browser.close(); }
