import assert from "node:assert/strict";
import { launch, BASE } from "./pw.mjs";

const browser = await launch();
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ok = (value, reason) => { assert.ok(value, reason); checks++; };
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const writes = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("request", request => { if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`); });

try {
  await page.goto(`${BASE}/prospr/`, { waitUntil: "domcontentloaded" });
  eq(await page.title(), "PROSPR Plan | CJ Portal");
  eq(await page.locator("#welcomePanel").isVisible(), true);
  eq(await page.locator("#workspace").isVisible(), false);
  const xlsxType = await page.evaluate(() => typeof XLSX);
  if (xlsxType !== "object") console.error(errors);
  eq(xlsxType, "object");

  const workbookBase64 = await page.evaluate(() => {
    const workbook = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    const monthDates = Array.from({ length: 12 }, (_, index) => new Date(2026, index, 28));
    add("Transactions", [
      ["Date", "Description", "Group", "Category", "Amount", "Account", "Account #", "Institution", "Month", "Week", "Transaction ID", "Check Number", "Full Description"],
      [new Date(2026, 10, 12), "Town Market 1234", "Living", "Grocery", -45, "Checking", "1001", "Test Bank", new Date(2026, 10, 1), new Date(2026, 10, 8), "t1", "", "TOWN MARKET 1234"],
      [new Date(2026, 10, 11), "Town Market 9999", "", "", -60, "Checking", "1001", "Test Bank", new Date(2026, 10, 1), new Date(2026, 10, 8), "t2", "", "TOWN MARKET 9999"],
      [new Date(2026, 10, 10), "Employer", "Income", "Salary", 5000, "Checking", "1001", "Test Bank", new Date(2026, 10, 1), new Date(2026, 10, 8), "t3", "", "EMPLOYER"],
      [new Date(2026, 10, 9), "Cafe", "Living", "Eating Out", -25, "Card", "2002", "Test Bank", new Date(2026, 10, 1), new Date(2026, 10, 8), "t4", "", "CAFE"]
    ]);
    add("Categories", [["Category", "Group", "Type"], ["Salary", "Income", "Income"], ["Grocery", "Living", "Expense"], ["Eating Out", "Living", "Expense"]]);
    add("Accounts", [["Account", "Account #", "Last Balance", "Last Update", "Institution", "Type", "Class (BH)"], ["Checking", "1001", 3000, new Date(2026, 10, 12), "Test Bank", "checking", "Asset"], ["Card", "2002", 750, new Date(2026, 10, 12), "Test Bank", "credit card", "Liability"]]);
    add("Monthly Budget", [["Monthly Budget"], [], [null, null, "Grocery", 1000, null, 800, null, 200, 1000, null, 800, null, 200], [null, null, "Eating Out", 300, null, 250, null, 50, 300, null, 250, null, 50], [null, null, "Salary", 5000, null, 5000, null, 0, 5000, null, 5000, null, 0]]);
    add("Picture Tomorrow", [[null, null, "Detail View", "Picture Today", "Annual Plan", ...monthDates], [null, null, "Salary", 60000, 60000, ...monthDates.map(() => 5000)], [null, null, "Grocery", 12000, 12000, ...monthDates.map(() => 1000)], [null, null, "Eating Out", 3600, 3600, ...monthDates.map(() => 300)]]);
    add("Notes", [["PROSPR test workbook"], ["All data stays in this browser test."]]);
    return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  });

  await page.setInputFiles("#workbookInput", {
    name: "PROSPR-test.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbookBase64, "base64")
  });
  await page.locator("#workspace").waitFor({ state: "visible" });
  await page.locator("#busyScreen").waitFor({ state: "hidden" });

  eq(await page.locator("#sheetCount").textContent(), "6 sheets");
  eq(await page.locator("#transactionCount").textContent(), "4 rows");
  eq(await page.locator("#accountCount").textContent(), "2 accounts");
  eq(await page.locator("#uncategorizedCount").textContent(), "1");
  ok((await page.locator("#uncategorizedCopy").textContent()).includes("likely category"));
  eq(await page.locator("#planChart .month-bars").count(), 12);
  eq(await page.locator("#budgetList .budget-row").count(), 2);
  eq(writes, []);

  for (const [width, height] of [[412, 839], [375, 667]]) {
    await page.setViewportSize({ width, height });
    for (const view of ["overview", "transactions", "budget", "plan", "accounts", "sheets", "settings"]) {
      await page.locator(`.bottom-nav button[data-target="${view}"]`).click();
      eq(await page.locator(".view.active").getAttribute("data-view"), view);
      eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
      eq(await page.locator(".bottom-nav").evaluate(node => node.scrollWidth - node.clientWidth), 0);
    }
    await page.locator('.bottom-nav button[data-target="overview"]').click();
    await page.screenshot({ path: `prospr-${width}.png`, fullPage: true });
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#workspace").waitFor({ state: "visible" });
  eq(await page.locator("#workbookStatus").textContent(), "PROSPR-test.xlsx  •  6 sheets read");

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const home = page.frameLocator("#shellFrame");
  await home.locator('.tab[data-page="1"]').click();
  eq(await home.locator('a.tool[href="/prospr/"]').isVisible(), false);
  await home.locator("#secretLogo").click({ clickCount: 3 });
  eq(await home.locator('a.tool[href="/prospr/"]').isVisible(), true);
  await home.locator('a.tool[href="/prospr/"]').click();
  await page.waitForURL(`${BASE}/prospr/`);
  const appFrame = page.frames().find(frame => frame !== page.mainFrame() && /\/prospr\/$/.test(frame.url()));
  ok(appFrame, "PROSPR should open inside the portal shell.");
  await appFrame.waitForSelector("#workspace:not([hidden])");
  eq(await appFrame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  eq(errors, []);
  console.log(`${checks} PROSPR import, privacy, mobile, persistence and portal checks passed.`);
} finally {
  await context.close();
  await browser.close();
}
