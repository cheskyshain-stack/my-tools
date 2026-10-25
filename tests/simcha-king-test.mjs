import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";

const browser = await launch(process.env.CJ_TEST_PROXY ? {
  proxy: { server: process.env.CJ_TEST_PROXY, bypass: "127.0.0.1,localhost" }
} : {});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const viewports = [[375, 667], [393, 852], [412, 839], [1280, 900]];

try {
  for (const [width, height] of viewports) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const errors = [], posts = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      const url = message.location().url || "";
      const browserIcon = /\/favicon\.ico(?:\?|$)/.test(url);
      const externalFont = /fonts\.(googleapis|gstatic)\.com/.test(url);
      if (message.type() === "error" && !browserIcon && !externalFont) errors.push(`${url}: ${message.text()}`);
    });
    page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
    await ctx.addInitScript(() => localStorage.setItem("cjSimchaUnrelatedTest", "keep"));

    await page.goto(`${BASE}/simcha-king/`, { waitUntil: "networkidle" });
    check(await page.title() === "Simcha King | CJ Portal", "The direct page has its own title.");
    check(await page.locator(".hero .intro").innerText() === "Tell us what you need and we’ll be in touch.", "The requested introduction is present.");
    check(await page.locator(".preview-status").innerText() === "Form preview. Nothing is sent.", "Preview status is clear.");
    const measure = async target => target.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      label: getComputedStyle(document.querySelector('label[for="fullName"]')).color,
      card: getComputedStyle(document.querySelector(".card")).backgroundColor,
      headerFits: [...document.querySelector("#cj-portal-nav").children].every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1;
      })
    }));
    let size = await measure(page);
    check(size.overflow === 0 && size.headerFits, `${width}px: direct page and navigation fit.`);
    check(size.label === "rgb(20, 36, 58)" && size.card === "rgb(255, 255, 255)", "Labels stay dark on white cards with the shared portal stylesheet.");

    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    check(await page.locator("#error-banner").isVisible(), "Missing contact and event details are rejected.");
    check(await page.locator("#canText").getAttribute("aria-invalid") === "true", "Text capability requires a choice.");
    await page.getByRole("button", { name: "Try a sample" }).click();
    await page.locator("#email").fill("");
    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    check(await page.locator("#review-view").isVisible(), "An event can be reviewed with optional email left empty.");
    let summary = await page.locator("#review-details").innerText();
    check(summary.includes("Kiddush") && summary.includes("About 40") && summary.includes("Classic Package"), "The service, guest size and package reach the review.");
    await page.getByRole("button", { name: "Back to editing" }).click();

    await page.locator("#simcha").selectOption("Bris");
    await page.locator("#guests").selectOption("About 100");
    check(await page.locator("#bris-menu").isVisible() && await page.locator("#packageLevel").isDisabled(), "Bris shows its own catering reference without requiring a generic package.");
    await page.locator("#bris-menu details").evaluateAll(items => items.forEach(item => { item.open = true; }));
    check(await page.locator("#bris-menu").evaluate(el => el.scrollWidth <= el.clientWidth), "The expanded Bris menu and price tables fit the phone width.");
    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    summary = await page.locator("#review-details").innerText();
    check(summary.includes("Bris") && summary.includes("Bagel Nosh") && !summary.includes("Classic Package"), "Bris review uses the supplier reference and excludes a previously selected generic package.");
    await page.getByRole("button", { name: "Back to editing" }).click();
    await page.locator("#simcha").selectOption("Kiddush");
    check(await page.locator("#bris-menu").isHidden() && await page.locator("#packageLevel").isEnabled() && await page.locator("#packageLevel").inputValue() === "Classic Package", "Switching back restores the original package selection.");

    await page.locator('input[value="question"]').check();
    await page.locator("#question").fill("");
    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    check(await page.locator("#question").getAttribute("aria-invalid") === "true", "A general question is required.");
    await page.locator("#question").fill("What does the Royal Package include? <img src=x onerror=alert(1)>");
    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    summary = await page.locator("#review-details").innerText();
    check(summary.includes("Royal Package") && !summary.includes("Event date"), "Questions do not include hidden event details.");
    check(await page.locator("#review-details img").count() === 0, "Customer text is displayed as text.");
    await page.getByRole("button", { name: "Back to editing" }).click();

    await page.locator('input[value="callback"]').check();
    await page.locator("#canText").selectOption("No");
    await page.locator("#callDate").fill("");
    await page.locator("#callTopic").fill("");
    await page.getByRole("button", { name: "Send Request", exact: true }).click();
    check(await page.locator("#review-view").isVisible(), "Callback details and email remain optional.");
    await page.getByRole("button", { name: "Finish preview", exact: true }).click();
    check((await page.locator("#finish-view").innerText()).includes("Nothing has been sent to Yossi."), "The preview does not claim delivery.");
    await page.getByRole("button", { name: "Start again", exact: true }).click();
    check(await page.locator("#fullName").inputValue() === "", "Restart clears the preview fields.");
    check(await page.evaluate(() => localStorage.getItem("cjSimchaUnrelatedTest")) === "keep", "Unrelated stored data is preserved.");
    check(await page.locator("#fullName").evaluate(el => document.activeElement === el), "Restart places keyboard focus in the first field.");

    const manifest = await (await ctx.request.get(`${BASE}/simcha-king/manifest.json`)).json();
    check(manifest.start_url === "/simcha-king/" && manifest.scope === "/simcha-king/", "The manifest points to this page.");
    const icon = await (await ctx.request.get(`${BASE}/simcha-king/icon.png`)).body();
    check(icon.readUInt32BE(16) === 512 && icon.readUInt32BE(20) === 512, "The app icon is 512 by 512.");

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    let home = page.frameLocator("#shellFrame");
    await home.locator('.tab[data-page="1"]').click();
    check(await home.locator(".hidden-tool:visible").count() === 0, "Existing hidden tools stay hidden.");
    check(await home.locator('a.tool[href="/simcha-king/"]').count() === 1, "There is one Simcha King card.");
    await home.locator('a.tool[href="/simcha-king/"]').click();
    await page.waitForURL(`${BASE}/simcha-king/`);
    let frame = page.frames().find(frame => frame !== page.mainFrame() && /\/simcha-king\//.test(frame.url()));
    check(!!frame, "The card opens Simcha King inside the portal iframe.");
    size = await measure(frame);
    check(size.overflow === 0 && size.headerFits && size.label === "rgb(20, 36, 58)", `${width}px: framed form fits and labels stay readable.`);
    await frame.locator("#review-request-button").scrollIntoViewIfNeeded();
    const button = await frame.locator("#review-request-button").boundingBox();
    const viewport = await page.locator("#shellFrame").evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, visible: visualViewport.height }));
    check(button.y + button.height <= viewport.visible + 1, "The bottom request button can be reached in the frame.");
    check(Math.abs(viewport.bottom - viewport.visible) < 1, "The portal frame fits the visible viewport.");

    await page.goBack();
    await page.waitForURL(`${BASE}/`);
    check(await page.frameLocator("#shellFrame").locator('.tab[data-page="1"]').isVisible(), "Back returns to the portal home.");
    await page.goForward();
    await page.waitForURL(`${BASE}/simcha-king/`);
    frame = page.frames().find(frame => frame !== page.mainFrame() && /\/simcha-king\//.test(frame.url()));
    check(await frame.locator("#request-form").isVisible(), "Forward restores the Simcha King page.");
    check(await frame.locator('a[href="/"], a[href="/home/"], .portal-home, [aria-label="CJ Portal home"]').count() === 0, "Simcha King has no controls linking back to the portal.");
    check(errors.length === 0, errors.join("\n"));
    check(posts.length === 0, "No live request, notification or payment is sent.");
    console.log(`  ok ${width}x${height}: standalone form, all request paths, shared styles, portal card, Back, Forward, and bottom button visibility`);
    await ctx.close();
  }
  console.log(`\n${checks} Simcha King checks passed.`);
} finally {
  await browser.close();
}
