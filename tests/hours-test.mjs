import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";

const EXAMPLE = "Monday 6, Tuesday 7.5, Wednesday 6, Thursday 5.5, Friday 5.5";
const browser = await launch();
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ok = (value, reason) => { assert.ok(value, reason); checks++; };
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage(), errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
async function paste(text) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.locator("#hoursInput").focus(); await page.keyboard.press("Control+A"); await page.keyboard.press("Control+V");
  await page.waitForFunction(value => document.getElementById("hoursInput").value === value, text);
}
async function total() { return page.locator("#grandTotal").textContent(); }
try {
  await page.goto(`${BASE}/hours/`, { waitUntil: "domcontentloaded" });
  eq(await page.locator("#copy").isDisabled(), true);
  eq(await page.inputValue("#rate"), "20");
  await paste(EXAMPLE);
  eq(await page.locator("#totalHours").textContent(), "30.5");
  eq(await total(), "610.00");
  eq(await page.locator("#rows tr").evaluateAll(ns => ns.map(tr => [...tr.cells].map(td => td.textContent))), [
    ["Monday","6","120.00"], ["Tuesday","7.5","150.00"], ["Wednesday","6","120.00"], ["Thursday","5.5","110.00"], ["Friday","5.5","110.00"]
  ]);
  await page.locator("#copy").click();
  await page.waitForFunction(() => document.getElementById("copyStatus").textContent === "Copied 610.00");
  eq(await page.evaluate(() => navigator.clipboard.readText()), "610.00");
  await page.fill("#rate", "25"); eq(await total(), "762.50");
  await page.fill("#rate", "20.50"); eq(await total(), "625.25");
  await page.fill("#rate", "50");
  eq(await total(), "1,525.00");
  await page.locator("#copy").click();
  await page.waitForFunction(() => document.getElementById("copyStatus").textContent === "Copied 1525.00");
  eq(await page.evaluate(() => navigator.clipboard.readText()), "1525.00");

  await page.fill("#rate", "20");
  await paste("Mon: 6 hrs\nTue 7.5 hours\nWed 6h\nThu 5.5\nFri 5.5\nSat 0\nSun 0");
  eq(await total(), "610.00");
  eq(await page.locator("#rows tr").count(), 7);
  for (const text of ["Monday -1", "Monday 25", "Monday 6.123", "Monday six", "Monday 6, Monday 7", "Monday 6, Unknown 9", "Monday 6:30"]) {
    await paste(text);
    eq(await page.locator("#copy").isDisabled(), true);
    eq(await total(), "Check your input");
    eq(await page.locator("#hoursInput").getAttribute("aria-invalid"), "true");
    eq(await page.locator("#breakdown").isVisible(), false);
  }
  await paste(EXAMPLE);
  for (const rate of ["", "-20", "20.001", "1000001", "abc"]) {
    await page.fill("#rate", rate);
    eq(await page.locator("#copy").isDisabled(), true);
    eq(await page.locator("#rateError").isVisible(), true);
    eq(await total(), "Check your input");
  }
  await page.fill("#rate", "0.50");
  await paste("Monday 0.01, Tuesday 0.01");
  eq(await total(), "0.01");
  eq(await page.locator("#roundingAmount").textContent(), "-0.01");
  eq(await page.locator("#roundingRow").isVisible(), true);
  await paste("Monday 0.01"); eq(await total(), "0.01");
  await page.fill("#rate", "20.10"); await paste("Monday .1, Tuesday .2");
  eq(await total(), "6.03");
  eq(await page.locator("#totalHours").textContent(), "0.3");
  await paste("Monday 0"); eq(await total(), "0.00");
  eq(await page.locator("#copy").isEnabled(), true);
  await paste(EXAMPLE); await page.fill("#rate", "0"); eq(await total(), "0.00");

  await page.fill("#rate", "20"); await paste(EXAMPLE);
  await page.evaluate(() => {
    window.originalClipboard = navigator.clipboard;
    window.originalCopyCommand = document.execCommand;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
    document.execCommand = () => false;
  });
  await page.locator("#copy").click();
  await page.waitForFunction(() => document.getElementById("copyStatus").textContent.includes("manually"));
  eq(await page.evaluate(() => window.getSelection().toString()), "610.00");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: window.originalClipboard }); document.execCommand = window.originalCopyCommand; });
  await page.fill("#rate", "25"); await page.reload({ waitUntil: "domcontentloaded" });
  eq(await page.inputValue("#hoursInput"), EXAMPLE);
  eq(await page.inputValue("#rate"), "25");
  eq(await total(), "762.50");
  await page.locator("#clear").click();
  eq(await page.inputValue("#hoursInput"), "");
  eq(await total(), "0.00");
  eq(await page.locator("#copy").isDisabled(), true);
  await page.locator("#example").click();
  eq(await total(), "762.50");
  eq(await page.inputValue("#rate"), "25");
  await page.fill("#rate", "20");
  for (const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]) {
    await page.setViewportSize({width,height});
    eq(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
    eq(await page.locator("#grandTotal").evaluate(n => n.scrollWidth > n.clientWidth + 1), false);
    await page.screenshot({path:`hours-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:375,height:667});
  await paste("Mon 24, Tue 24, Wed 24, Thu 24, Fri 24, Sat 24, Sun 24");
  await page.fill("#rate", "1000000"); eq(await total(), "168,000,000.00");
  eq(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
  eq(await page.locator("#grandTotal").evaluate(n => n.scrollWidth > n.clientWidth + 1), false);
  await paste(EXAMPLE); await page.fill("#rate", "20");
  await page.goto(`${BASE}/`, {waitUntil:"domcontentloaded"});
  const home=page.frameLocator("#shellFrame"); await home.locator('.tab[data-page="1"]').click();
  eq(await home.locator(".hidden-tool:visible").count(), 0);
  await home.locator('a.tool[href="/hours/"]').click(); await page.waitForURL(`${BASE}/hours/`);
  const frame=page.frames().find(f=>f!==page.mainFrame()&&/\/hours\//.test(f.url())); ok(frame);
  await frame.waitForFunction(() => document.getElementById("grandTotal").textContent === "610.00");
  eq(await frame.inputValue("#hoursInput"), EXAMPLE);
  eq(await frame.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth), 0);
  await frame.locator("#copy").click();
  await frame.waitForFunction(() => document.getElementById("copyStatus").textContent === "Copied 610.00");
  eq(await page.evaluate(() => navigator.clipboard.readText()), "610.00");
  await page.goBack(); await page.waitForURL(`${BASE}/`);
  await page.goForward(); await page.waitForURL(`${BASE}/hours/`);
  eq(await page.locator("#shellFrame").count(), 1);
  eq(errors, []);
  console.log(`${checks} hours parsing, exact totals, clipboard, persistence, mobile and portal checks passed.`);
} finally { await context.close(); await browser.close(); }
