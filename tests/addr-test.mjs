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
await ctx.route("**/nominatim.openstreetmap.org/**", route=>route.fulfill({status:200,
  contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},
  body:JSON.stringify([{lat:"45.9237",lon:"6.8694",
    display_name:"Chamonix-Mont-Blanc, Haute-Savoie, Auvergne, France"}])}));
const pg=await ctx.newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
pg.on("console",m=>{if(m.type()==="error"&&!/favicon|fonts\.g|ERR_/.test(m.text()))errs.push(m.text());});
const settled=()=>pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",null,{timeout:240000});
const shown=()=>pg.$eval("#hits",n=>n.textContent.trim());

/* ---------- the example is nobody's house ---------- */
await pg.goto(APP,{waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await settled();
check("the example address is a made up one",
  await pg.$eval("#addr", n=>n.getAttribute("placeholder")), "123 Main Street, Lakewood NJ");
check("and Coles Way is gone from the page",
  /Coles Way/.test(await pg.content()), false);

/* ---------- an address typed and picked stays put ---------- */
await pg.fill("#addr","Chamonix");
await pg.press("#addr","Enter");
await pg.waitForSelector(".hit");
await pg.click('.hit[data-hit="0"]');
await pg.waitForTimeout(500); await settled(); await pg.waitForTimeout(300);
check("it says which place it took", await shown(), "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("and the box still holds what was typed", await pg.inputValue("#addr"), "Chamonix");

await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
check("the typed address survives a refresh", await pg.inputValue("#addr"), "Chamonix");
check("and so does the place it found", await shown(), "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
check("with the coordinates to match", [await pg.inputValue("#lat"), await pg.inputValue("#lon")],
  ["45.92370","6.86940"]);

/* ---------- a second tab, opened fresh, shows the same ---------- */
const pg2 = await ctx.newPage();
await pg2.goto(APP,{waitUntil:"domcontentloaded"});
await pg2.waitForTimeout(500);
check("a new tab on the same page shows it too", await pg2.inputValue("#addr"), "Chamonix");
check("and names the same place", await pg2.$eval("#hits",n=>n.textContent.trim()),
  "Showing Chamonix-Mont-Blanc, Haute-Savoie, Auvergne");
await pg2.close();

/* ---------- a preset names itself and drops the old address ---------- */
await pg.click('.spot[data-spot="1"]');       // Jerusalem
await pg.waitForTimeout(500); await settled(); await pg.waitForTimeout(300);
check("a preset names itself", await shown(), "Showing Jerusalem");
check("and clears the address box", await pg.inputValue("#addr"), "");
await pg.reload({waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.waitForTimeout(400);
check("which also survives a refresh", await shown(), "Showing Jerusalem");

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
