import { launch } from "./pw.mjs";
let pass=0,fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;
  console.log(`${ok?"  ok ":"FAIL "} ${n}`+(ok?"":`\n        got  ${JSON.stringify(g)}\n        want ${JSON.stringify(w)}`));};
const b=await launch();
const ctx=await b.newContext({viewport:{width:393,height:852},deviceScaleFactor:3});
const pg=await ctx.newPage();
const bad=[]; // 304 means the browser already had it, which is a hit, not a failure
pg.on("response",r=>{const c=r.status();if(r.url().includes("icon.png")&&!(c<300||c===304))bad.push(r.url()+" "+c);});
await pg.goto("http://127.0.0.1:8099/home/",{waitUntil:"networkidle"});
await pg.evaluate(()=>{try{localStorage.setItem("cjAppsHiddenToolsVisible","1")}catch(e){}});
await pg.reload({waitUntil:"networkidle"});
await pg.waitForTimeout(600);
const r=await pg.evaluate(()=>{
  const a=[...document.querySelectorAll('a.tool')].find(x=>x.getAttribute("href")==="/horizon/");
  const img=a.querySelector("img");
  return {name:a.querySelector(".tool-name").textContent, alt:img.getAttribute("alt"),
          src:img.getAttribute("src"), nat:[img.naturalWidth,img.naturalHeight],
          box:[Math.round(img.getBoundingClientRect().width)]};
});
check("the card is named for the artwork", r.name, "Netz & Shkiya");
check("and so is the alt text", r.alt, "Netz and Shkiya");
check("the icon is stamped fresh", r.src, "/horizon/icon.png?v=3");
check("it is a square 512", r.nat, [512,512]);
check("no icon failed to load", bad, []);
await (await pg.locator('a.tool[href="/horizon/"]')).screenshot({path:"icon-in-portal.png"});

await pg.goto("http://127.0.0.1:8099/horizon/",{waitUntil:"domcontentloaded"});
await pg.waitForTimeout(400);
check("the page title matches", await pg.title(), "Netz & Shkiya | CJ Portal");
check("the heading matches", await pg.$eval("h1", n=>n.textContent), "Netz & Shkiya");
check("no stale spelling anywhere on the page",
  /Shkia\b/.test(await pg.evaluate(()=>document.body.innerText)), false);

/* ---------- the header icon goes nowhere ---------- */
const brand = await pg.evaluate(()=>{
  const el=document.querySelector(".cj-brand");
  return {tag:el.tagName, href:el.getAttribute("href"), inAnchor:!!el.closest("a"),
          shows:getComputedStyle(el).display!=="none",
          size:[Math.round(el.getBoundingClientRect().width)],
          cursor:getComputedStyle(el).cursor};
});
check("the header mark is not a link", [brand.tag, brand.href, brand.inAnchor], ["DIV", null, false]);
check("it is still there and still the right size", [brand.shows, brand.size], [true, [48]]);
check("and it does not pretend to be clickable", brand.cursor, "auto");
// prove it by tapping it: the address must not move
const before = pg.url();
await pg.click(".cj-brand");
await pg.waitForTimeout(900);
check("tapping it stays on the tool", pg.url(), before);
check("and nothing navigated", new URL(pg.url()).pathname, "/horizon/");
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
