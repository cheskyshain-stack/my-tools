import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {launch,BASE} from './pw.mjs';
const require=createRequire(import.meta.url),P=require('../label-cropper/vendor/pdf-lib.min.js');
const browser=await launch(),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cj-label-test-')),errors=[],sent=[];
const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))sent.push(r.method());});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,msg)=>{assert.ok(a,msg);checks++;};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function imageHashes(bytes){const d=await P.PDFDocument.load(bytes);return d.context.enumerateIndirectObjects().filter(([,v])=>v instanceof P.PDFRawStream&&String(v.dict.get(P.PDFName.of('Subtype')))==='/Image').map(([,v])=>hash(v.getContents()));}
async function ready(){await page.waitForFunction(()=>!document.getElementById('download').disabled,null,{timeout:30000});}
async function upload(file){await page.setInputFiles('#file',file);await ready();eq(await page.locator('#error').isVisible(),false);}
async function download(name){const event=page.waitForEvent('download');await page.locator('#download').click();const d=await event,target=path.join(scratch,name);await d.saveAs(target);return fs.readFileSync(target);}
async function verify(bytes,size,original){const doc=await P.PDFDocument.load(bytes);eq(doc.getPageCount(),1);eq([doc.getPage(0).getWidth(),doc.getPage(0).getHeight()],size);const input=await imageHashes(original),output=await imageHashes(bytes);ok(output.length>0&&output.every(h=>input.includes(h)),'Original compressed image streams survive unchanged');}
try{
 await page.goto(`${BASE}/label-cropper/`,{waitUntil:'networkidle'});eq(await page.locator('#empty').isVisible(),true);eq(await page.locator('#workspace').isVisible(),false);
 // Generic, non-personal fixtures keep this suite usable without uploaded samples.
 const generated=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=1800;c.height=1200;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1800,1200);ctx.fillStyle='black';ctx.font='bold 90px sans-serif';ctx.fillText('TEST SHIPPING LABEL',80,150);ctx.font='40px sans-serif';ctx.fillText('Synthetic test data only',80,220);
  for(let i=0;i<100;i++){const x=90+i*16;ctx.fillRect(x,400,4+i%3*2,440);}ctx.strokeStyle='black';ctx.lineWidth=8;ctx.strokeRect(20,20,1760,1160);
  const png=c.toDataURL('image/png'),a=await PDFLib.PDFDocument.create(),image=await a.embedPng(png),first=a.addPage([612,792]);first.drawText('Return instructions above the label',{x:40,y:740,size:13});first.drawImage(image,{x:32.25,y:156,width:547.5,height:370.5});const second=a.addPage([612,792]);second.drawText('Packing slip, not a label',{x:40,y:740,size:13});
  const b=await PDFLib.PDFDocument.create(),bi=await b.embedPng(png),bp=b.addPage([612,792]);bp.drawImage(bi,{x:32.25,y:156,width:547.5,height:370.5});bp.setMediaBox(29,152,554,378);bp.setCropBox(29,152,554,378);bp.setRotation(PDFLib.degrees(90));
  return [Array.from(await a.save()),Array.from(await b.save())];
 });
 const first=path.join(scratch,'return-with-instructions.pdf'),rotated=path.join(scratch,'already-cropped-rotated.pdf');fs.writeFileSync(first,Uint8Array.from(generated[0]));fs.writeFileSync(rotated,Uint8Array.from(generated[1]));
 await upload(first);eq(await page.locator('#pageNumber option').count(),2);let crop=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));
 ok(crop.x>20&&crop.y>250&&crop.w>540&&crop.h<390,'Finds the entire embedded label instead of the instructions');ok(await page.locator('#cropOverlay .handle').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().width>=21)),'Touch crop handles stay large on a phone');ok((await page.locator('#dimensions').textContent()).includes('90°'));
 let output=await download('fixture-4x6.pdf');await verify(output,[288,432],fs.readFileSync(first));
 await page.selectOption('#pageNumber','2');await ready();ok((await page.locator('#status').textContent()).includes('No label found'));
 await page.selectOption('#pageNumber','1');await ready();
 await page.locator('#cropOverlay').focus();const before=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));await page.keyboard.press('ArrowRight');await ready();crop=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));ok(Math.abs(crop.x-before.x-1)<.01,'Keyboard nudges use page coordinates');
 await page.locator('.fine-tune summary').click();await page.fill('#cropX','12.3');eq(await page.inputValue('#cropX'),'12.3');await ready();eq(await page.inputValue('#cropX'),'12.3');
 await page.locator('#findLabel').click();await ready();await page.locator('#cropOverlay').scrollIntoViewIfNeeded();
 const box=await page.locator('#cropOverlay').boundingBox(),view=(await page.locator('#cropOverlay').getAttribute('viewBox')).split(' ').map(Number);crop=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));
 const x=box.x+(crop.x+crop.w/2)/view[2]*box.width,y=box.y+(crop.y+crop.h/2)/view[3]*box.height,cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+7,y:y+6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready();
 const moved=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));ok(moved.x>crop.x&&moved.y>crop.y,'Touch dragging moves the crop');
 // Existing crop boxes and /Rotate metadata must both survive the conversion.
 await upload(rotated);eq(await page.locator('#pageNumber option').count(),1);crop=JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));eq(crop,{x:0,y:0,w:378,h:554});
 for(const rotation of ['auto','0','90','180','270']){
  await page.selectOption('#rotation',rotation);await ready();output=await download('rotated-'+rotation+'.pdf');await verify(output,[288,432],fs.readFileSync(rotated));
 }
 await page.selectOption('#paper','6x4');await page.selectOption('#rotation','auto');await ready();output=await download('landscape.pdf');await verify(output,[432,288],fs.readFileSync(rotated));
 // Bad input clears the previous output; replacing it is supported.
 const bad=path.join(scratch,'broken.pdf');fs.writeFileSync(bad,'This is not a PDF.');await page.setInputFiles('#file',bad);await page.waitForFunction(()=>!document.getElementById('error').hidden);eq(await page.locator('#download').isDisabled(),true);eq(await page.locator('#workspace').isVisible(),false);
 await upload(first);await page.selectOption('#paper','4x6');await ready();
 // Do not silently drop printable form data during original-content embedding.
 const formDoc=await P.PDFDocument.load(fs.readFileSync(rotated)),field=formDoc.getForm().createTextField('test-field');field.setText('Visible test data');field.addToPage(formDoc.getPage(0),{x:100,y:250,width:180,height:30});
 const formPath=path.join(scratch,'editable-label.pdf');fs.writeFileSync(formPath,await formDoc.save());await page.setInputFiles('#file',formPath);await page.waitForFunction(()=>!document.getElementById('error').hidden);
 ok((await page.locator('#error').textContent()).includes('editable fields'));eq(await page.locator('#download').isDisabled(),true);await upload(first);
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  eq(await page.locator('.card').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);await page.screenshot({path:`label-cropper-${width}.png`,fullPage:true});
 }
 // Private samples are supplied at runtime and are never committed to the site.
 if(process.env.CJ_LABEL_SAMPLE_CONFIG){
  const samples=JSON.parse(fs.readFileSync(process.env.CJ_LABEL_SAMPLE_CONFIG));
  for(let i=0;i<samples.length;i++){
   const original=fs.readFileSync(samples[i]);await upload(samples[i]);await page.selectOption('#rotation','auto');await ready();output=await download('private-'+i+'.pdf');await verify(output,[288,432],original);
  }
 }
 eq(sent,[]);eq(errors,[]);
 await page.setViewportSize({width:375,height:667});await page.goto(`${BASE}/`,{waitUntil:'networkidle'});const home=page.frameLocator('#shellFrame');await home.locator('.tab[data-page="1"]').click();eq(await home.locator('.hidden-tool:visible').count(),0);await home.locator('a.tool[href="/label-cropper/"]').click();await page.waitForURL(`${BASE}/label-cropper/`);const tool=page.frameLocator('#shellFrame');eq(await tool.locator('#file').isVisible(),true);eq(await tool.locator('body').evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 await page.goBack();await page.waitForURL(`${BASE}/`);await page.goForward();await page.waitForURL(`${BASE}/label-cropper/`);eq(await page.locator('#shellFrame').count(),1);eq(errors,[]);
 console.log(`${checks} PDF crop, original-image preservation, page/rotation/crop-box, touch, mobile and portal checks passed.`);
}finally{fs.rmSync(scratch,{recursive:true,force:true});await context.close();await browser.close();}
