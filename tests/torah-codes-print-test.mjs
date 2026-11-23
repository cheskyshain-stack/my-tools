import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch,BASE} from './pw.mjs';
const provenance=JSON.parse(fs.readFileSync(new URL('../torah-codes/data/provenance.json',import.meta.url),'utf8'));
// The user's print example: four letters at +3, Gen 12:11 letters 51 through 60.
const saved={version:1,text:provenance.counts.standard.SHA256,tradition:'standard',scope:[0,304805],fold:false,primary:{query:'שפרא',start:14725,step:3},grid:{width:4,zoom:22,context:100,page:0},passages:{between:false,page:0},extras:[]};
const url=BASE+'/torah-codes/#result='+Buffer.from(JSON.stringify(saved)).toString('base64url');
const browser=await launch({headless:true}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let checks=0;function check(value,message){checks++;assert(value,message);}
// Chromium writes one uncompressed Page object for each actual printed PDF page.
const pdfPages=pdf=>(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
for(const [width,height]of [[375,667],[393,852],[412,839],[1280,900]]){
 await page.setViewportSize({width,height});await page.goto(url);await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Saved result verified'));
 check(await page.locator('#gridWidth').inputValue()==='4','User four-column layout reproduced');check(await page.locator('.letter').count()===210,'Original 100-letter context on both sides reproduced');check(await page.locator('#pasukList h4').textContent()==='Bereishis 12:11','User pasuk reference reproduced');check(await page.locator('#pasukList .pasuk-hit').count()===4,'All four actual letters preserved');check(!(await page.locator('#printGrid').isChecked()),'Grid printing is off by default');check(await page.locator('#printGrid').isVisible(),'Print option is easy to find');check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Print options fit screen '+width);
 await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++;window.dispatchEvent(new Event('beforeprint'));};});
 await page.locator('#printResult').click();check(await page.evaluate(()=>window.__printCalls)===1,'Print button opens print flow');check(!(await page.locator('body').evaluate(n=>n.classList.contains('print-with-grid'))),'Print button respects default grid exclusion');
 await page.emulateMedia({media:'print'});
 check(await page.locator('#gridBox').isHidden()&&await page.locator('#gridWindow').isHidden()&&await page.locator('#legend').isHidden(),'Grid and surrounding-letter captions are omitted');check(await page.locator('#gridHeading').isVisible()&&await page.locator('#patternMeta').isVisible(),'Word and skip remain printable');check(await page.locator('#pasukList').isVisible()&&await page.locator('#printLetters tr').count()===4,'Pasuk and all four exact references are printed');check(await page.locator('.print-options').isHidden(),'Print setting itself stays off paper');
 for(const format of ['Letter','A4']){const pdf=await page.pdf({format,printBackground:true});check(pdfPages(pdf)===1,`The user's short match fits one ${format} page from ${width}px viewport`);fs.writeFileSync(`/tmp/torah-compact-${width}-${format}.pdf`,pdf);}
 await page.emulateMedia({media:'screen'});check(await page.locator('#gridBox').isVisible()&&await page.locator('.letter').count()===210,'Screen grid is preserved');
 await page.locator('#printGrid').check();check(await page.locator('#printGrid').evaluate(n=>document.activeElement===n),'Changing the print option preserves focus');await page.locator('#printResult').click();check(await page.evaluate(()=>window.__printCalls)===2,'Optional grid uses the same print flow');
 await page.emulateMedia({media:'print'});check(await page.locator('#gridBox').isVisible()&&await page.locator('#gridWindow').isVisible(),'Grid appears only when explicitly enabled');check(await page.locator('.letter').count()===210,'Optional print includes the chosen grid window');const withGrid=await page.pdf({format:'Letter',printBackground:true});check(pdfPages(withGrid)>1,'Optional full context intentionally adds grid pages');if(width===375)fs.writeFileSync('/tmp/torah-optional-grid-Letter.pdf',withGrid);
 await page.emulateMedia({media:'screen'});await page.locator('#printGrid').uncheck();await page.emulateMedia({media:'print'});const again=await page.pdf({format:'Letter',printBackground:true});check(pdfPages(again)===1&&await page.locator('#gridBox').isHidden(),'Turning grid off restores compact one-page print');await page.emulateMedia({media:'screen'});
}
// Browser-menu printing must also respect the checkbox, without needing the app button.
await page.evaluate(()=>{document.getElementById('printGrid').checked=true;window.dispatchEvent(new Event('beforeprint'));});await page.emulateMedia({media:'print'});check(await page.locator('#gridBox').isVisible(),'Native beforeprint reads enabled setting');await page.emulateMedia({media:'screen'});await page.evaluate(()=>{document.getElementById('printGrid').checked=false;window.dispatchEvent(new Event('beforeprint'));});await page.emulateMedia({media:'print'});check(await page.locator('#gridBox').isHidden(),'Native beforeprint reads disabled setting');
check(errors.length===0,'No console or page errors: '+JSON.stringify(errors));await browser.close();console.log(`${checks} Torah print checks passed, including one-page Letter/A4 PDFs for the reported skip-3 match.`);
