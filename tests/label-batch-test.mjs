import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {launch,BASE} from './pw.mjs';
const require=createRequire(import.meta.url),P=require('../label-cropper/vendor/pdf-lib.min.js');
const browser=await launch(),context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true}),page=await context.newPage();
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cj-label-batch-')),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))sent.push(r.method());});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const ready=()=>page.waitForFunction(()=>!document.getElementById('download').disabled,null,{timeout:30000});
const crop=async()=>JSON.parse(await page.locator('#cropOverlay').getAttribute('data-crop'));
async function download(name){const event=page.waitForEvent('download');await page.locator('#download').click();const d=await event,p=path.join(scratch,name);await d.saveAs(p);return fs.readFileSync(p);}
async function verify(bytes,count,size){const d=await P.PDFDocument.load(bytes);eq(d.getPageCount(),count);eq(d.getPages().map(p=>[p.getWidth(),p.getHeight()]),Array.from({length:count},()=>size));return d;}
async function imageHashes(bytes){const d=await P.PDFDocument.load(bytes);return d.context.enumerateIndirectObjects().filter(([,v])=>v instanceof P.PDFRawStream&&String(v.dict.get(P.PDFName.of('Subtype')))==='/Image').map(([,v])=>crypto.createHash('sha256').update(v.getContents()).digest('hex'));}
async function choose(id){await page.selectOption('#labelNumber',id);await ready();}
async function renderColors(bytes){return page.evaluate(async values=>{
 const pdfjs=await import('/label-cropper/vendor/pdfjs/pdf.min.js'),task=pdfjs.getDocument({data:Uint8Array.from(values),isEvalSupported:false,standardFontDataUrl:'/label-cropper/vendor/pdfjs/standard_fonts/'}),pdf=await task.promise,result=[];
 for(let i=1;i<=pdf.numPages;i++){
  const p=await pdf.getPage(i),view=p.getViewport({scale:1}),c=document.createElement('canvas');c.width=Math.ceil(view.width);c.height=Math.ceil(view.height);const ctx=c.getContext('2d',{willReadFrequently:true});await p.render({canvasContext:ctx,viewport:view,background:'white'}).promise;
  const data=ctx.getImageData(0,0,c.width,c.height).data,counts={red:0,blue:0,green:0,purple:0,orange:0};
  for(let j=0;j<data.length;j+=4){const r=data[j],g=data[j+1],b=data[j+2];if(r>170&&g<70&&b<70)counts.red++;if(b>170&&r<70&&g<70)counts.blue++;if(g>140&&r<70&&b<70)counts.green++;if(r>140&&b>140&&g<70)counts.purple++;if(r>170&&g>80&&g<160&&b<70)counts.orange++;}
  result.push({counts,text:(await p.getTextContent()).items.map(i=>i.str).join(' ')});
 }
 await task.destroy();return result;
},Array.from(bytes));}
async function verifyColors(bytes,expected){const renders=await renderColors(bytes);eq(renders.length,expected.length);for(let i=0;i<expected.length;i++){ok(renders[i].counts[expected[i]]>500,'Each PDF page shows its own complete label');eq(Object.entries(renders[i].counts).filter(([color,count])=>color!==expected[i]&&count>50),[]);}return renders;}
try{
 await page.goto(`${BASE}/label-cropper/`,{waitUntil:'networkidle'});
 const fixture=await page.evaluate(async()=>{
  const d=await PDFLib.PDFDocument.create(),colors=['#ff0000','#0000ff','#ff00ff'],images=[];
  for(let i=0;i<3;i++){
   const c=document.createElement('canvas');c.width=900;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,600);ctx.fillStyle=colors[i];ctx.fillRect(20,20,860,110);ctx.fillStyle='black';ctx.font='bold 40px sans-serif';ctx.fillText('TEST LABEL '+['A','B','D'][i],40,200);for(let j=0;j<60;j++)ctx.fillRect(40+j*13,280,3+j%3,250);images.push(await d.embedPng(c.toDataURL('image/png')));
  }
  const first=d.addPage([612,792]);first.drawText('Instructions, not part of either label',{x:50,y:775,size:10});first.drawImage(images[0],{x:90,y:430,width:432,height:288});first.drawImage(images[1],{x:90,y:60,width:432,height:288});
  const second=d.addPage([288,432]);second.drawRectangle({x:10,y:350,width:268,height:60,color:PDFLib.rgb(0,1,0)});second.drawText('VECTOR LABEL C',{x:20,y:310,size:17});for(let j=0;j<35;j++)second.drawRectangle({x:20+j*7,y:70,width:2+j%3,height:160,color:PDFLib.rgb(0,0,0)});
  const third=d.addPage([612,792]);third.drawImage(images[2],{x:32.25,y:156,width:547.5,height:370.5});third.setMediaBox(29,152,554,378);third.setCropBox(29,152,554,378);third.setRotation(PDFLib.degrees(90));
  const fourth=d.addPage([612,792]);fourth.drawText('Review this page manually',{x:40,y:740,size:15});fourth.drawRectangle({x:90,y:220,width:432,height:288,borderColor:PDFLib.rgb(0,0,0),borderWidth:1,color:PDFLib.rgb(1,1,1)});fourth.drawRectangle({x:100,y:430,width:412,height:60,color:PDFLib.rgb(1,.5,0)});fourth.drawText('MANUAL VECTOR LABEL E',{x:110,y:370,size:16});
  return Array.from(await d.save());
 });
 const input=Buffer.from(fixture);await page.setInputFiles('#file',{name:'multiple-labels.pdf',mimeType:'application/pdf',buffer:input});await ready();
 eq(await page.locator('#labelNumber option:not([value=""])').count(),4);ok((await page.locator('#batchSummary').textContent()).includes('4 labels included'));eq(await page.locator('#unmatchedPages').getByRole('button',{name:'Review page 4',exact:true}).count(),1);eq(await page.locator('#cropOverlay .handle').count(),0);
 const firstCrop=await crop();let output=await download('all-labels.pdf');const originalExport=Buffer.from(output);await verify(output,4,[288,432]);const renders=await verifyColors(output,['red','blue','green','purple']);ok(renders[2].text.includes('VECTOR LABEL C'),'Vector label text remains PDF text');
 const originalHashes=await imageHashes(input),outputHashes=await imageHashes(output);ok(originalHashes.length>=3&&outputHashes.every(h=>originalHashes.includes(h)),'All image streams keep their original compressed bytes');ok(originalHashes.every(h=>outputHashes.includes(h)),'Images from every source page are present');
 await page.locator('#nextLabel').click();await ready();eq(await page.inputValue('#pageNumber'),'1');const secondCrop=await crop();ok(secondCrop.y>firstCrop.y+300,'Two labels on the same page have distinct crops');
 await page.locator('#editCrop').click();await page.locator('#cropOverlay').focus();await page.keyboard.press('ArrowDown');await page.locator('#editCrop').click();await ready();const edited=await crop();eq(edited.y,secondCrop.y+1);
 await page.locator('#nextLabel').click();await ready();eq(await page.inputValue('#pageNumber'),'2');await page.locator('#nextLabel').click();await ready();eq(await page.inputValue('#pageNumber'),'3');eq(await page.locator('#editCrop').textContent(),'Adjust crop');
 await choose('label-1');eq(await crop(),firstCrop);await choose('label-2');eq(await crop(),edited);
 await page.selectOption('#rotation','180');await ready();await choose('label-1');eq(await page.inputValue('#rotation'),'auto');await choose('label-2');eq(await page.inputValue('#rotation'),'180');await page.selectOption('#rotation','auto');await page.locator('#findLabel').click();await ready();eq(await crop(),secondCrop);
 await page.uncheck('#includeLabel');await ready();output=await download('without-label-b.pdf');await verify(output,3,[288,432]);await verifyColors(output,['red','green','purple']);
 for(const id of ['label-1','label-3','label-4']){await choose(id);await page.uncheck('#includeLabel');}
 await page.waitForFunction(()=>document.getElementById('batchSummary').textContent.startsWith('0 labels'));await page.waitForFunction(()=>document.getElementById('status').textContent.includes('No labels included'));eq(await page.locator('#download').isDisabled(),true);eq(await page.locator('#error').isVisible(),false);
 for(const id of ['label-1','label-2','label-3','label-4']){await page.selectOption('#labelNumber',id);await page.waitForFunction(id=>document.getElementById('labelNumber').value===id&&!document.getElementById('addLabel').disabled,id);await page.check('#includeLabel');await ready();}
 await page.selectOption('#pageNumber','4');await ready();eq(await page.locator('#outputFrame').isVisible(),false);ok((await page.locator('#pageNote').textContent()).includes('No label found'));eq(await page.locator('#editCrop').isDisabled(),true);
 await page.locator('#addLabel').click();eq(await page.locator('#editCrop').textContent(),'Done');eq(await page.locator('#download').isDisabled(),true);await page.locator('#cancelCrop').click();await ready();eq(await page.locator('#labelNumber option:not([value=""])').count(),4);
 await page.locator('#addLabel').click();await page.locator('.fine-tune summary').click();for(const [id,value] of [['cropW',438/612*100],['cropH',294/792*100],['cropX',87/612*100],['cropY',281/792*100]])await page.fill('#'+id,String(value));await page.locator('#editCrop').click();await ready();eq(await page.locator('#labelNumber option:not([value=""])').count(),5);eq(await page.locator('#unmatchedPages').isVisible(),false);
 output=await download('including-manual-label.pdf');await verify(output,5,[288,432]);await verifyColors(output,['red','blue','green','purple','orange']);
 // Cancelling a new label also restores the previously selected label.
 const manualCrop=await crop();await page.locator('#addLabel').click();await page.locator('#cancelCrop').click();await ready();eq(await crop(),manualCrop);eq(await page.locator('#labelNumber option:not([value=""])').count(),5);
 await page.selectOption('#paper','6x4');await ready();output=await download('all-landscape.pdf');await verify(output,5,[432,288]);await verifyColors(output,['red','blue','green','purple','orange']);
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){
  await page.setViewportSize({width,height});eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);eq(await page.locator('.card').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);await page.screenshot({path:`label-batch-${width}.png`,fullPage:true});
 }
 // Rapid navigation must not reuse a canvas before the prior rendering is cancelled.
 await page.evaluate(()=>{const select=document.getElementById('pageNumber');for(const value of ['2','3','1']){select.value=value;select.dispatchEvent(new Event('change'));}});await ready();eq(await page.inputValue('#pageNumber'),'1');eq(await crop(),firstCrop);
 // A document with no automatic matches stays reviewable and requires an explicit label.
 const manualDoc=await P.PDFDocument.create(),manualPage=manualDoc.addPage([612,792]);manualPage.drawText('A manually selected vector label',{x:40,y:650,size:16});await page.setInputFiles('#file',{name:'manual-only.pdf',mimeType:'application/pdf',buffer:Buffer.from(await manualDoc.save())});await page.waitForFunction(()=>!document.getElementById('workspace').hidden&&!document.getElementById('addLabel').disabled&&document.getElementById('labelNumber').options.length===1);
 eq(await page.locator('#download').isDisabled(),true);eq(await page.locator('#error').isVisible(),false);await page.locator('#addLabel').click();await page.locator('#editCrop').click();await ready();await verify(await download('manual-only-output.pdf'),1,[432,288]);
 // Identical image resources at distinct positions are separate labels, even when small.
 const grid=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=900;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,600);ctx.fillStyle='red';ctx.fillRect(20,20,860,110);ctx.fillStyle='black';for(let j=0;j<50;j++)ctx.fillRect(40+j*16,250,4,280);
  const d=await PDFLib.PDFDocument.create(),image=await d.embedPng(c.toDataURL('image/png')),p=d.addPage([612,792]);for(let row=0;row<3;row++)for(let col=0;col<3;col++)p.drawImage(image,{x:65+col*155,y:500-row*145,width:126,height:84});return Array.from(await d.save());
 });
 await page.setInputFiles('#file',{name:'nine-small-labels.pdf',mimeType:'application/pdf',buffer:Buffer.from(grid)});await ready();eq(await page.locator('#labelNumber option:not([value=""])').count(),9);output=await download('nine-labels.pdf');await verify(output,9,[432,288]);eq(await page.locator('#unmatchedPages').isVisible(),false);eq(await imageHashes(output),await imageHashes(Buffer.from(grid)));
 // Printable fields on a different included label must also block the entire export.
 const annotated=await P.PDFDocument.load(input),field=annotated.getForm().createTextField('later-page-field');field.setText('Required visible data');field.addToPage(annotated.getPage(1),{x:20,y:245,width:220,height:25});
 await page.setInputFiles('#file',{name:'later-label-field.pdf',mimeType:'application/pdf',buffer:Buffer.from(await annotated.save())});await page.waitForFunction(()=>!document.getElementById('error').hidden);ok((await page.locator('#error').textContent()).includes('page 2'));eq(await page.inputValue('#pageNumber'),'1');eq(await page.locator('#download').isDisabled(),true);
 await page.selectOption('#labelNumber','label-3');await page.waitForFunction(()=>document.getElementById('labelNumber').value==='label-3'&&!document.getElementById('editCrop').disabled);await page.uncheck('#includeLabel');await ready();await verify(await download('without-editable-label.pdf'),3,[432,288]);eq(await page.locator('#error').isVisible(),false);
 // Earlier cropper PDFs retain clipped source resources; hidden images are not labels.
 await page.setInputFiles('#file',{name:'already-exported-labels.pdf',mimeType:'application/pdf',buffer:originalExport});await ready();eq(await page.locator('#labelNumber option:not([value=""])').count(),4);output=await download('reopened-labels.pdf');await verify(output,4,[432,288]);await verifyColors(output,['red','blue','green','purple']);
 eq(sent,[]);eq(errors,[]);console.log(`${checks} multi-label detection, ordering, rendered-content separation, original streams, vector content, per-label edits, exclusion, manual additions, sizes, mobile and cancellation checks passed.`);
}finally{fs.rmSync(scratch,{recursive:true,force:true});await context.close();await browser.close();}
