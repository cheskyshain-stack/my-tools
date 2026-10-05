import { tileBytes } from "./tiles.mjs";
import { launch, BASE } from "./pw.mjs";
const APP=`${BASE}/horizon/`;
let pass=0,fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;
  console.log(`${ok?"  ok ":"FAIL "} ${n}`+(ok?"":`\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`));};


const b=await launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.route("**/elevation-tiles-prod/**", async route=>{
  const body=await tileBytes(route.request().url());
  route.fulfill(body?{status:200,contentType:"image/png",body,headers:{"Access-Control-Allow-Origin":"*"}}:{status:404,body:""});
});
let lookups = 0;
await ctx.route("**/nominatim.openstreetmap.org/**", route=>{
  lookups++;
  const query = new URL(route.request().url()).searchParams.get("q");
  return route.fulfill({status:200,
  contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},
  body:JSON.stringify(query === "Jerusalem"
    ? [{lat:"31.7780",lon:"35.2354",display_name:"Jerusalem"}]
    : [{lat:"45.9237",lon:"6.8694",display_name:"Chamonix-Mont-Blanc, Haute-Savoie, Auvergne, France"}])});
});
const pg=await ctx.newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
pg.on("console",m=>{if(m.type()==="error"&&!/favicon|fonts\.g|ERR_/.test(m.text()))errs.push(m.text());});
const settled=()=>pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",null,{timeout:240000});
const shown=()=>pg.$eval("#hits",n=>n.textContent.trim());
const recents=()=>pg.locator("[data-recent]").allTextContents();

/* ---------- the example is nobody's house ---------- */
await pg.goto(APP,{waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await settled();
check("the example address is a made up one",
  await pg.$eval("#addr", n=>n.getAttribute("placeholder")), "123 Main Street, Lakewood NJ");
check("and Coles Way is gone from the page",
  /Coles Way/.test(await pg.content()), false);
check("there are no invented example places", await recents(), []);
check("the section says Recent searches", await pg.locator("#recentLabel").innerText(), "Recent searches");

/* ---------- an address typed and picked stays put ---------- */
await pg.fill("#addr","Chamonix");
await pg.press("#addr","Enter");
await pg.waitForSelector(".hit");
check("unselected lookup results are not recent places", await recents(), []);
await pg.click('.hit[data-hit="0"]');
await pg.waitForTimeout(500); await settled(); await pg.waitForTimeout(300);
check("it says which place it took", await shown(), "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("and the box still holds what was typed", await pg.inputValue("#addr"), "Chamonix");
check("a selected address becomes a recent search", await recents(), ["Chamonix-Mont-Blanc, Haute-Savoie, Auvergne"]);

await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
check("the typed address survives a refresh", await pg.inputValue("#addr"), "Chamonix");
check("and so does the place it found", await shown(), "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("with the coordinates to match", [await pg.inputValue("#lat"), await pg.inputValue("#lon")],
  ["45.92370","6.86940"]);
check("recent searches survive a refresh", await recents(), ["Chamonix-Mont-Blanc, Haute-Savoie, Auvergne"]);

/* ---------- a second tab, opened fresh, shows the same ---------- */
const pg2 = await ctx.newPage();
await pg2.goto(APP,{waitUntil:"domcontentloaded"});
await pg2.waitForTimeout(500);
check("a new tab on the same page shows it too", await pg2.inputValue("#addr"), "Chamonix");
check("and names the same place", await pg2.$eval("#hits",n=>n.textContent.trim()),
  "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("recent searches are available in another tab too", await pg2.locator("[data-recent]").allTextContents(), ["Chamonix-Mont-Blanc, Haute-Savoie, Auvergne"]);
await pg2.close();

/* ---------- selected addresses are kept in most recent order ---------- */
await pg.fill("#addr", "Jerusalem"); await pg.press("#addr", "Enter");
await pg.waitForSelector(".hit"); await pg.click('.hit[data-hit="0"]');
await pg.waitForTimeout(500); await settled(); await pg.waitForTimeout(300);
check("a searched place names itself", await shown(), "Showing Jerusalem");
check("and keeps the search text", await pg.inputValue("#addr"), "Jerusalem");
check("new searches appear first", await recents(), ["Jerusalem", "Chamonix-Mont-Blanc, Haute-Savoie, Auvergne"]);
await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
check("which also survives a refresh", await shown(), "Showing Jerusalem");
const beforeRecent = lookups;
await pg.locator('[data-recent="1"]').click();
check("a recent search restores its saved coordinates", [await pg.inputValue("#lat"),await pg.inputValue("#lon")], ["45.92370","6.86940"]);
check("and restores its original query", await pg.inputValue("#addr"), "Chamonix");
check("without another address lookup", lookups, beforeRecent);
check("reused places move to the front without duplicates", await recents(), ["Chamonix-Mont-Blanc, Haute-Savoie, Auvergne", "Jerusalem"]);
await pg.waitForTimeout(500); await settled();
const beforeRemove = await pg.locator("#setBox").innerText();
await pg.locator('[data-remove-recent="0"]').click();
check("the x removes only that recent search", await recents(), ["Jerusalem"]);
check("removing the active search keeps the current place", await shown(), "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("and does not change the calculated times", await pg.locator("#setBox").innerText(), beforeRemove);
await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
check("a removed search stays removed after a refresh", await recents(), ["Jerusalem"]);
await pg.locator('[data-remove-recent="0"]').click();
check("the last search can be removed too", await recents(), []);
check("removing the last search leaves focus on a button", await pg.evaluate(()=>document.activeElement.id), "gps");
check("an empty history explains what will be saved", await pg.locator("#spots").innerText(), "Addresses you choose will appear here.");
await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
check("an intentionally empty history is not repopulated on refresh", await recents(), []);

/* ---------- typed coordinates are a different place ---------- */
await pg.fill("#lat","41.0"); await pg.dispatchEvent("#lat","change");
await pg.waitForTimeout(500);
check("typing coordinates stops claiming the old place", await shown(), "");
await settled();
await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
check("and it stays cleared after a refresh", await shown(), "");

check("no console errors", errs, []);
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
