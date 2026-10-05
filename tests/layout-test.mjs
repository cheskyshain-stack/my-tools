import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";
import { tileBytes } from "./tiles.mjs";

const browser = await launch();
let checks = 0;
try {
  for (const [width, height] of [[375, 667], [393, 852], [412, 839], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addInitScript(() => {
      if (localStorage.getItem("cjHorizonRecentSearchesV1") === null) {
        localStorage.setItem("cjHorizonRecentSearchesV1", JSON.stringify([
          { name: "A long saved address " + "abcdefghij".repeat(45), query: "A long saved address", lat: 45.9237, lon: 6.8694 },
          { name: "Jerusalem", query: "Jerusalem", lat: 31.778, lon: 35.2354 }
        ]));
      }
    });
    await ctx.route("**/elevation-tiles-prod/**", async route => {
      const body = await tileBytes(route.request().url());
      await route.fulfill({ status: body ? 200 : 404, contentType: "image/png", body: body || "",
        headers: { "Access-Control-Allow-Origin": "*" } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", msg => {
      if (msg.type() === "error" && !/favicon|fonts\.g|ERR_/.test(msg.text())) errors.push(msg.text());
    });
    await page.goto(`${BASE}/horizon/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("run").textContent === "Read again");
    const measure = async (frame = page) => frame.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedTimes: [...document.querySelectorAll(".terrain-time")].filter(n => n.scrollWidth > n.clientWidth + 1).length,
      firstTime: Math.max(...[...document.querySelectorAll(".terrain-time")].map(n => n.getBoundingClientRect().bottom)),
      panelTops: [...document.querySelectorAll(".main-time")].map(n => n.getBoundingClientRect().top)
    }));
    const initial = await measure();
    assert.equal(initial.overflow, 0); checks++;
    assert.equal(initial.clippedTimes, 0); checks++;
    assert.ok(initial.firstTime < height, `${width}px: skyline times are below the fold`); checks++;
    assert.equal(await page.locator("#locationControls").getAttribute("open"), null); checks++;
    assert.equal(await page.locator("#settings").getAttribute("open"), null); checks++;
    assert.equal(initial.panelTops[0], initial.panelTops[1]); checks++;
    assert.equal(await page.locator("#comparison").getAttribute("open"), null); checks++;
    assert.equal(await page.locator("#chartDetails").getAttribute("open"), null); checks++;
    await page.locator("#comparison > summary").click();
    console.log(`  ok ${width}px: both skyline times end at ${initial.firstTime.toFixed(1)}px, overflow ${initial.overflow}px`);
    await page.screenshot({ path: `layout-${width}.png`, fullPage: true });

    // Exercise both disclosure levels, not just their closed summaries.
    await page.locator("#locationControls > summary").click();
    assert.equal(await page.locator("[data-recent]").count(), 2); checks++;
    assert.equal((await measure()).overflow, 0); checks++;
    await page.locator('[data-remove-recent="0"]').press("Enter");
    assert.deepEqual(await page.locator("[data-recent]").allTextContents(), ["Jerusalem"]); checks++;
    assert.equal(await page.inputValue("#lat"), "40.09590"); checks++;
    await page.locator("#settings > summary").click();
    assert.equal((await measure()).overflow, 0); checks++;
    await page.locator("#eye").fill("1.7");
    await page.locator("#eye").dispatchEvent("change");
    assert.equal(await page.locator("#skyCard").isVisible(), false); checks++;
    assert.match(await page.locator("#setBox .lbl").nth(2).innerText(), /not read yet/); checks++;
    await page.waitForFunction(() => document.getElementById("run").textContent === "Read again");
    assert.match(await page.locator("#setBox .lbl").nth(2).innerText(), /ground/); checks++;
    await page.locator("#locationControls > summary").click();
    for (const side of ["rise", "set"]) {
      await page.locator(`#skyWho [data-sky="${side}"]`).click();
      assert.equal(await page.locator(`#skyWho [data-sky="${side}"]`).getAttribute("aria-pressed"), "true"); checks++;
      assert.equal((await measure()).overflow, 0); checks++;
    }
    await page.locator("#chartDetails > summary").click();
    assert.equal((await measure()).overflow, 0); checks++;
    await page.locator("#about summary").click();
    assert.equal((await measure()).overflow, 0); checks++;
    await page.locator("#about summary").click();
    await page.locator("#locationControls > summary").click();
    await page.screenshot({ path: `layout-controls-${width}.png`, fullPage: true });

    // The portal's card must open this same page inside its iframe.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const home = page.frameLocator("#shellFrame");
    // Tools are the second tab on the portal.
    await home.locator('.tab[data-page="1"]').click();
    assert.equal(await home.locator(".hidden-tool:visible").count(), 0); checks++;
    await home.locator('a.tool[href="/horizon/"]').click();
    await page.waitForURL(`${BASE}/horizon/`);
    const frame = page.frames().find(f => f !== page.mainFrame() && /\/horizon\//.test(f.url()));
    assert.ok(frame); checks++;
    await frame.waitForFunction(() => document.getElementById("run").textContent === "Read again");
    assert.equal(await frame.inputValue("#eye"), "1.7"); checks++;
    assert.equal((await measure(frame)).overflow, 0); checks++;
    await frame.locator("#locationControls > summary").click();
    await frame.locator("#settings > summary").click();
    assert.equal((await measure(frame)).overflow, 0); checks++;
    const dimensions = await page.locator("#shellFrame").evaluate(n => ({ bottom: n.getBoundingClientRect().bottom, visible: visualViewport.height }));
    assert.ok(Math.abs(dimensions.bottom - dimensions.visible) < 1); checks++;
    assert.deepEqual(errors, []); checks++;
    await ctx.close();
  }
  console.log(`\n${checks} layout and portal checks passed.`);
} finally { await browser.close(); }
