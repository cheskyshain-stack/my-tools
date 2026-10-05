import { launch } from "./pw.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
const run = promisify(execFile);
const APP="http://127.0.0.1:8099/horizon/";
let pass=0,fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;
  console.log(`${ok?"  ok ":"FAIL "} ${n}`+(ok?"":`\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`));};

fs.mkdirSync("tiles",{recursive:true});
let hits=0, block=false;
async function tileBytes(url){
  const m=/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(url);
  const p=`tiles/${m[1]}_${m[2]}_${m[3]}.png`;
  if(!fs.existsSync(p)){try{await run("curl",["-s","-f","-m","60","-o",p,url]);}catch(e){fs.writeFileSync(p,"");}}
  const b=fs.readFileSync(p); return b.length?b:null;
}
const b=await launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.route("**/elevation-tiles-prod/**", async route=>{
  if(block) return route.abort();
  hits++;
  const body=await tileBytes(route.request().url());
  route.fulfill(body?{status:200,contentType:"image/png",body,headers:{"Access-Control-Allow-Origin":"*"}}:{status:404,body:""});
});
const pg=await ctx.newPage();
const cdp=await ctx.newCDPSession(pg);
const offline = async on => { block = on; await cdp.send("Network.setCacheDisabled",{cacheDisabled:on}); };
const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
pg.on("console",m=>{if(m.type()==="error"&&!/favicon|fonts\.g|ERR_/.test(m.text()))errs.push(m.text());});
const settled=()=>pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",null,{timeout:240000});
const row=box=>pg.$$eval(`#${box} .ans .lbl span`,n=>n[2].textContent);
const times=box=>pg.$$eval(`#${box} .ans .t:not(.head)`,n=>n.map(x=>x.childNodes[0].textContent.trim()).filter((_,i)=>i%2===0));

/* ---------- set something up worth keeping ---------- */
await pg.goto(APP,{waitUntil:"domcontentloaded"});
await settled();
for(const [id,v] of [["lat","45.9237"],["lon","6.8694"]]){await pg.fill("#"+id,v);await pg.dispatchEvent("#"+id,"change");}
await pg.waitForTimeout(600); await settled(); await pg.waitForTimeout(400);
await pg.fill("#date","2027-06-21"); await pg.dispatchEvent("#date","change");
await pg.waitForTimeout(500); await settled(); await pg.waitForTimeout(300);
await pg.click('#skyWho [data-sky="rise"]'); await pg.waitForTimeout(300);
const wantRow = await row("setBox"), wantTimes = await times("setBox");
const wantPin = await pg.$eval(".spot-card a", n=>n.getAttribute("href"));
console.log("   before refresh:", wantRow, "|", JSON.stringify(wantTimes));

/* ---------- refresh with the map unreachable: nothing may be lost ---------- */
await offline(true);
await pg.reload({waitUntil:"domcontentloaded"});
await pg.waitForTimeout(900);
/* A restored reading is rebuilt by interpolating the stored rays, where a live one
   walks the exact bearing, so it is close rather than identical until the quiet
   re-check lands. Close is the thing worth asserting. */
const deg = t => Number(/(-?[\d.]+)°/.exec(t)[1]);
const mins = t => { const m=/^(\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(t.trim());
  return (Number(m[1])%12 + (/PM/.test(m[4])?12:0))*60 + Number(m[2]) + Number(m[3])/60; };
const gotRow = await row("setBox"), gotTimes = await times("setBox");
console.log("   after refresh :", gotRow, "|", JSON.stringify(gotTimes));
check("the third row survives a refresh", Math.abs(deg(gotRow) - deg(wantRow)) < 0.12, true);
check("and the times with it, to a few seconds",
  gotTimes.every((t,i) => Math.abs(mins(t) - mins(wantTimes[i])) < 0.75), true);
check("and the day you were on", await pg.inputValue("#date"), "2027-06-21");
check("and the half of the sky you were looking at",
  await pg.$eval('#skyWho button.on', n=>n.getAttribute("data-sky")), "rise");
check("and the place", [await pg.inputValue("#lat"), await pg.inputValue("#lon")], ["45.92370","6.86940"]);
check("the chart is drawn without fetching anything", await pg.$$eval("#sky path", n=>n.length), 2);
await settled();
await pg.waitForTimeout(400);
check("a failed re-check keeps what is on screen", Math.abs(deg(await row("setBox")) - deg(wantRow)) < 0.12, true);
check("and says so rather than blanking", /rebuilt from the saved profile/.test(await pg.$eval("#readState",n=>n.textContent)), true);
check("the button stays a refresh", await pg.$eval("#run",n=>n.textContent), "Read again");

/* ---------- refresh with the map reachable: the pin becomes exact again ---------- */
await offline(false);
const before = hits;
await pg.reload({waitUntil:"domcontentloaded"});
await pg.waitForTimeout(120);
check("it shows the stored reading straight away", Math.abs(deg(await row("setBox")) - deg(wantRow)) < 0.12, true);
// the wording only stands while the check runs, so it is waited for rather than sampled
let saidChecking = true;
try {
  await pg.waitForFunction(()=>/Checking it against the map again/.test(
    document.getElementById("readState").textContent), null, {timeout: 8000});
} catch (e) { saidChecking = false; }
check("and says it is checking", saidChecking, true);
await settled();
await pg.waitForTimeout(500);
check("the quiet re-check did fetch", hits > before, true);
check("and the pin is back where it was", await pg.$eval(".spot-card a", n=>n.getAttribute("href")), wantPin);
const agree = await pg.evaluate(()=>{
  const up=/standing ([\d.-]+)/.exec(document.querySelector(".spot-card p").textContent);
  const used=/stands (-?[\d.]+) degrees/.exec(document.getElementById("skyNote").textContent);
  return {pin:Number(up[1]), solver:Number(used[1])};
});
console.log("   pin", agree.pin, "deg vs solver", agree.solver, "deg");
check("and pin and solver agree again", Math.abs(agree.pin-agree.solver) < 0.05, true);

/* ---------- a day already gone does not come back ---------- */
await pg.evaluate(()=>{const s=JSON.parse(localStorage.getItem("cjHorizonV1"));s.date="2020-01-01";
  localStorage.setItem("cjHorizonV1",JSON.stringify(s));});
await pg.reload({waitUntil:"domcontentloaded"});
await pg.waitForTimeout(600);
const today = new Date();
const iso = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
check("a stale past date lands on today instead", await pg.inputValue("#date"), iso);

/* ---------- the labels say what they mean ---------- */
const labels = await pg.$$eval("label[for='elev'], label[for='eye']", n=>n.map(x=>x.textContent));
check("the two height boxes name their unit", labels,
  ["Height of the ground, in metres","How far above it you are, in metres"]);
check("and neither of them mentions eyes", /eyes/i.test(labels.join(" ")), false);
check("and a line explains them",
  /how far above that land you are/.test(await pg.evaluate(()=>document.body.innerText)), true);
check("and says how little the second one is worth",
  /worth about 30 seconds/.test(await pg.evaluate(()=>document.body.innerText)), true);
check("and that it starts at nothing",
  /0 standing on it/.test(await pg.evaluate(()=>document.body.innerText)), true);
check("with metres put in feet for anyone who wants it",
  /1 metre is about 3 feet 3/.test(await pg.evaluate(()=>document.body.innerText)), true);

check("no console errors", errs, []);
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
