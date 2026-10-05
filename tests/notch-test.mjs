import { launch } from "./pw.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
const run = promisify(execFile);
const APP = "http://127.0.0.1:8099/horizon/";
let pass=0,fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;
  console.log(`${ok?"  ok ":"FAIL "} ${n}`+(ok?"":`\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`));};

fs.mkdirSync("tiles",{recursive:true});
async function tileBytes(url){
  const m=/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(url);
  const p=`tiles/${m[1]}_${m[2]}_${m[3]}.png`;
  if(!fs.existsSync(p)){try{await run("curl",["-s","-f","-m","60","-o",p,url]);}catch(e){fs.writeFileSync(p,"");}}
  const b=fs.readFileSync(p); return b.length?b:null;
}
const b=await launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await ctx.route("**/elevation-tiles-prod/**", async route=>{
  const body=await tileBytes(route.request().url());
  route.fulfill(body?{status:200,contentType:"image/png",body,headers:{"Access-Control-Allow-Origin":"*"}}:{status:404,body:""});
});
const pg=await ctx.newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
pg.on("console",m=>{if(m.type()==="error"&&!/favicon|fonts\.g|ERR_/.test(m.text()))errs.push(m.text());});
const settled=()=>pg.waitForFunction(()=>document.getElementById("run").textContent!=="Reading the ground",null,{timeout:240000});

await pg.goto(APP,{waitUntil:"domcontentloaded"});
await settled();
// the coordinate and height fields now live inside two nested disclosures
const openUp = () => pg.evaluate(() => {
  ["locationControls","settings"].forEach(id => { const d=document.getElementById(id); if (d) d.open = true; });
});
await openUp();

/* Chamonix on 11 December: a year sweep of sun paths over this skyline found 15
   crossings that day, the most anywhere tested. If the first one is being reported,
   the page says so and names the last. */
await openUp();
for (const [id,v] of [["lat","45.9237"],["lon","6.8694"]]) {
  await pg.fill("#"+id,v); await pg.dispatchEvent("#"+id,"change");
}
await openUp();
await pg.fill("#eye","5.6"); await pg.dispatchEvent("#eye","change");   // 1.7 m, in feet
await pg.fill("#date","2027-12-11"); await pg.dispatchEvent("#date","change");
await pg.waitForTimeout(600); await settled(); await pg.waitForTimeout(500);

const note = await pg.$eval("#setBox", n => n.textContent);
check("a notched skyline is called out", /does not set in one go/.test(note), true);
check("and it says the time given is the first crossing", /that first crossing/.test(note), true);
const m = /crosses it (\d+) more times?, the last at ([\d:apmAPM ]+)\./.exec(note);
check("it counts the later crossings", !!m, true);
console.log("   says:", m ? `${m[1]} more crossings, last at ${m[2].trim()}` : "(no match)");

const times = await pg.$$eval("#setBox .ans .t:not(.head)",
  n=>n.map(x=>x.childNodes[0].textContent.trim()).filter((_,i)=>i%2===0));
const mins = t => { const q=/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  return q ? (Number(q[1])%12+(/pm/i.test(q[4])?12:0))*60+Number(q[2])+Number(q[3])/60 : null; };
const first = mins(times[2]), last = m ? mins(m[2]) : null;
check("the time shown is earlier than the last crossing", first !== null && last !== null && first < last, true);
console.log("   first crossing", times[2], "| last", m && m[2].trim());

/* and a plain skyline must not grow a warning it does not need */
await openUp();
for (const [id,v] of [["lat","40.0959"],["lon","-74.2176"]]) {
  await pg.fill("#"+id,v); await pg.dispatchEvent("#"+id,"change");
}
await openUp();
await pg.fill("#eye","5.6"); await pg.dispatchEvent("#eye","change");   // 1.7 m, in feet
await pg.fill("#date","2026-09-30"); await pg.dispatchEvent("#date","change");
await pg.waitForTimeout(600); await settled(); await pg.waitForTimeout(400);
check("flat country gets no such warning",
  /in one go/.test(await pg.$eval("#setBox", n=>n.textContent)), false);
check("no console errors", errs, []);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
