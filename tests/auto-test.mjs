import { tileBytes } from "./tiles.mjs";
import { launch, BASE } from "./pw.mjs";
const APP = `${BASE}/horizon/`;
let pass=0,fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;
  console.log(`${ok?"  ok ":"FAIL "} ${n}`+(ok?"":`\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`));};

let tileHits = 0;

const b=await launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.addInitScript(() => {
  if (localStorage.getItem("cjHorizonRecentSearchesV1") === null) {
    localStorage.setItem("cjHorizonRecentSearchesV1", JSON.stringify([
      { name: "Chamonix", query: "Chamonix", lat: 45.9237, lon: 6.8694 }
    ]));
  }
});
await ctx.route("**/elevation-tiles-prod/**", async route=>{
  tileHits++;
  const body=await tileBytes(route.request().url());
  route.fulfill(body?{status:200,contentType:"image/png",body,headers:{"Access-Control-Allow-Origin":"*"}}
                    :{status:404,body:""});
});
await ctx.route("**/nominatim.openstreetmap.org/**", route=>route.fulfill({status:200,
  contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},
  body:JSON.stringify([{lat:"45.9237",lon:"6.8694",display_name:"Chamonix, Haute-Savoie, France"}])}));
const pg=await ctx.newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
pg.on("console",m=>{if(m.type()==="error"&&!/favicon|fonts\.g|ERR_/.test(m.text()))errs.push(m.text());});
const dialogs=[]; pg.on("dialog",async d=>{dialogs.push(d.message());await d.dismiss();});

const settled = () => pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",
  null,{timeout:240000});
const thirdRow = box => pg.$$eval(`#${box} .ans .lbl span`, n=>n[2].textContent);

/* ---------- it reads on the way in, without being asked ---------- */
/* Catching the "Reading the ground" label is a race when the tiles are already in the
   browser's cache, so the test is that ground was fetched and a third row appeared
   without anything being clicked. */
const fresh = tileHits;
await pg.goto(APP,{waitUntil:"domcontentloaded"});
await pg.locator("#locationControls").evaluate(n => { n.open = true; });
await pg.locator("#settings").evaluate(n => { n.open = true; });
await pg.selectOption("#units", "metres");
await settled();
await pg.waitForTimeout(400);
check("it fetched ground without being asked", tileHits > fresh, true);
check("and finished with a third row", /ground .* at \d+/.test(await thirdRow("setBox")), true);
check("the button has become a refresh", await pg.$eval("#run", n=>n.textContent), "Read again");
check("it says what it did", /updates automatically/.test(await pg.$eval("#readState", n=>n.textContent)), true);
check("nothing popped up a box", dialogs, []);

/* ---------- a recent search reads again on its own ---------- */
const before = await thirdRow("setBox");
await pg.click('.spot[data-recent="0"]');      // Chamonix
await pg.waitForTimeout(500);
await settled();
await pg.waitForTimeout(400);
const after = await thirdRow("setBox");
check("tapping a place reads that place", before !== after, true);
check("and it is the alpine one", /\d\d\.\d+° up/.test(after), true);
console.log("   Lakewood:", before, "| Chamonix:", after);

/* ---------- an address reads too ---------- */
await pg.fill("#lat","40.0959"); await pg.dispatchEvent("#lat","change");
await pg.fill("#lon","-74.2176"); await pg.dispatchEvent("#lon","change");
await pg.waitForTimeout(600); await settled(); await pg.waitForTimeout(300);
await pg.fill("#addr","Chamonix");
await pg.press("#addr","Enter");
await pg.waitForSelector(".hit");
await pg.click('.hit[data-hit="0"]');
await pg.waitForTimeout(500);
await settled();
await pg.waitForTimeout(400);
check("picking an address reads it", /\d\d\.\d+° up/.test(await thirdRow("setBox")), true);

/* ---------- the same place twice costs nothing ---------- */
const spent = tileHits;
await pg.click('.spot[data-recent="0"]');       // Chamonix again, already in hand
await pg.waitForTimeout(900);
check("re-picking the place it is already on fetches nothing", tileHits, spent);
check("and the button stays a refresh", await pg.$eval("#run", n=>n.textContent), "Read again");

/* ---------- the date alone does not send for more ground ---------- */
const spent2 = tileHits;
await pg.click("#dnext"); await pg.waitForTimeout(700);
await pg.click("#dnext"); await pg.waitForTimeout(700);
check("stepping a day reuses the ground already read", tileHits, spent2);
check("and the third row still answers", /ground .* at \d+/.test(await thirdRow("setBox")), true);

/* ---------- but a date half a year off does ---------- */
await pg.fill("#date","2027-06-21"); await pg.dispatchEvent("#date","change");
await pg.waitForTimeout(700); await settled(); await pg.waitForTimeout(400);
check("midsummer is still inside the ground that was read",
  /beyond the patch/.test(await thirdRow("setBox")), false);

/* ---------- a height you type is yours ---------- */
await pg.fill("#elev","2000"); await pg.dispatchEvent("#elev","change");
await pg.waitForTimeout(600); await settled(); await pg.waitForTimeout(400);
check("a typed elevation is not overwritten by the reading",
  await pg.inputValue("#elev"), "2000");
const second = await pg.$$eval("#setBox .ans .lbl span", n=>n[1].textContent);
console.log("   second row now reads:", second);
check("and it moved the second row", /2000 m up/.test(second), true);

/* ---------- a reading in flight must not overwrite what you type ----------
   Deliberate rather than racy: the tiles are held back for a second, the height is
   typed while the reading is out, and the reading is then allowed to land. */
let hold = 0;
await ctx.unroute("**/elevation-tiles-prod/**");
await ctx.route("**/elevation-tiles-prod/**", async route=>{
  if (hold) await new Promise(r=>setTimeout(r, hold));
  const body=await tileBytes(route.request().url());
  route.fulfill(body?{status:200,contentType:"image/png",body,headers:{"Access-Control-Allow-Origin":"*"}}
                    :{status:404,body:""});
});
hold = 900;
await pg.fill("#lat","44.2795"); await pg.dispatchEvent("#lat","change");
await pg.fill("#lon","-73.9799"); await pg.dispatchEvent("#lon","change");
await pg.waitForFunction(()=>document.getElementById("run").textContent==="Reading the ground",
  null,{timeout:10000});
check("the box is empty while the reading is out", await pg.inputValue("#elev"), "");
await pg.fill("#elev","750"); await pg.dispatchEvent("#elev","change");
hold = 0;
await settled();
await pg.waitForTimeout(600);
check("a height typed mid reading survives it", await pg.inputValue("#elev"), "750");
check("and the second row is measured from it",
  /750 m up/.test(await pg.$$eval("#setBox .ans .lbl span", n=>n[1].textContent)), true);
check("and the skyline is measured from it too, not from the map's figure",
  await pg.evaluate(()=>{
    const t=document.querySelector(".spot-geometry");
    return t ? /above the reference level/.test(t.textContent) : true;
  }), true);

/* ---------- the page must not write into a box you are typing in ----------
   The reading is held back, the box is focused and half filled, and the reading is
   let go while the caret is still in it. Writing there destroys the selection, so
   the rest of the typing lands AFTER the page's figure: 1000 became 27.41000. */
hold = 1200;
await pg.fill("#lat","40.0959"); await pg.dispatchEvent("#lat","change");
await pg.fill("#lon","-74.2176"); await pg.dispatchEvent("#lon","change");
await pg.focus("#elev");
await pg.keyboard.type("10");
hold = 0;
await pg.waitForTimeout(2200);               // the reading lands with the caret still in there
await pg.keyboard.type("00");
await pg.dispatchEvent("#elev","change");
check("typing is not interrupted by the reading", await pg.inputValue("#elev"), "1000");
await settled();
await pg.waitForTimeout(400);
check("and it stays what was typed", await pg.inputValue("#elev"), "1000");

check("no console errors", errs, []);
await pg.screenshot({path:"auto-read.png"});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
