import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {launch,BASE} from './pw.mjs';
const browser=await launch(),context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage(),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cj-label-print-')),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))sent.push(r.method());});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
function crc32(bytes){let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;}return (n^0xffffffff)>>>0;}
function png(bytes,width,height,dpi){
 eq([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);const chunks=[];
 for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);eq(crc32(bytes.subarray(offset+4,offset+8+length)),bytes.readUInt32BE(offset+8+length));chunks.push({type,data});offset+=length+12;}
 const header=chunks.find(c=>c.type==='IHDR').data,phys=chunks.filter(c=>c.type==='pHYs');eq([header.readUInt32BE(0),header.readUInt32BE(4)],[width,height]);eq(phys.length,1);eq([phys[0].data.readUInt32BE(0),phys[0].data.readUInt32BE(4),phys[0].data[8]],[Math.round(dpi/.0254),Math.round(dpi/.0254),1]);eq(chunks.at(-1).type,'IEND');
 return {header,rows:inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)))};
}
function unzip(bytes){
 const files=[];let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),date=bytes.readUInt16LE(offset+12),length=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28),name=bytes.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extraLength,data=bytes.subarray(start,start+length);eq(flags&0x800,0x800);eq(method,0);eq((date>>>9)+1980,new Date().getFullYear());eq(crc32(data),bytes.readUInt32LE(offset+14));files.push({name,data});offset=start+length;}
 const end=bytes.length-22;eq(bytes.readUInt32LE(offset),0x02014b50);eq(bytes.readUInt32LE(end),0x06054b50);eq(bytes.readUInt16LE(end+10),files.length);eq(bytes.readUInt32LE(end+16),offset);return files;
}
const ready=()=>page.waitForFunction(()=>!document.getElementById('download').disabled,null,{timeout:30000});
async function downloadImage(name){const event=page.waitForEvent('download');await page.locator('#downloadImage').click();const d=await event,target=path.join(scratch,name);await d.saveAs(target);await page.waitForFunction(()=>!document.getElementById('downloadImage').disabled);return {name:d.suggestedFilename(),bytes:fs.readFileSync(target)};}
async function decodedPixels(bytes){return page.evaluate(async data=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(data)],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,result=[];for(const [x,y] of [[100,920],[230,920]])result.push(Array.from(pixels.subarray((y*canvas.width+x)*4,(y*canvas.width+x)*4+4)));bitmap.close();return result;},Array.from(bytes));}
try{
 await page.goto(`${BASE}/label-cropper/`,{waitUntil:'networkidle'});
 eq(await page.evaluate(()=>LabelPrint.crc32(new TextEncoder().encode('123456789'))),0xcbf43926);
 const fixture=await page.evaluate(async()=>{
  const make=async shift=>{const c=document.createElement('canvas');c.width=812;c.height=1218;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';for(let x=60+shift;x<752;x+=2)ctx.fillRect(x,150,1,650);ctx.fillStyle='rgb(96,96,96)';ctx.fillRect(60,900,100,100);ctx.fillStyle='rgb(190,190,190)';ctx.fillRect(190,900,100,100);return c.toDataURL('image/png');};
  const a=await PDFLib.PDFDocument.create(),first=await a.embedPng(await make(0));a.addPage([288,432]).drawImage(first,{x:0,y:0,width:288,height:432});
  const b=await PDFLib.PDFDocument.load(await a.save()),second=await b.embedPng(await make(1));b.addPage([288,432]).drawImage(second,{x:0,y:0,width:288,height:432});return [Array.from(await a.save()),Array.from(await b.save())];
 });
 await page.setInputFiles('#file',{name:'fine-bars.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture[0])});await ready();await page.locator('#imageOptions').click();eq(await page.locator('#printerImages').evaluate(n=>n.open),true);eq(await page.locator('#imageOptions').getAttribute('aria-expanded'),'true');
 eq(await page.inputValue('#printerDpi'),'203');let output=await downloadImage('native-203.png');ok(output.name.endsWith('-203dpi.png'));let image=png(output.bytes,812,1218,203);eq([...image.header.subarray(8)],[1,0,0,0,0]);
 const stride=Math.ceil(812/8)+1,pixel=(x,y)=>(image.rows[y*stride+1+(x>>>3)]>>>(7-(x&7)))&1;
 // A native 203 dpi fixture contains one-dot bars. A scaled screen preview loses them.
 eq(image.rows.length,stride*1218);for(const y of [150,375,799]){const bits=Array.from({length:692},(_,x)=>pixel(x+60,y));eq(bits,Array.from({length:692},(_,x)=>x%2));eq(bits.slice(1).filter((b,i)=>b!==bits[i]).length,691);}eq([pixel(59,400),pixel(752,400)],[1,1]);eq([pixel(100,920),pixel(230,920)],[0,1]);ok(await page.locator('#outputCanvas').evaluate(n=>n.width<812),'Printer image is made at native resolution independently of the screen preview');
 await page.selectOption('#printMode','color');output=await downloadImage('shades-203.png');image=png(output.bytes,812,1218,203);eq(image.header[8],8);eq(await decodedPixels(output.bytes),[[96,96,96,255],[190,190,190,255]]);
 // The fallback keeps exact black/white pixels if CompressionStream is unavailable.
 await page.evaluate(()=>{window.CompressionStream=undefined;});await page.selectOption('#printMode','mono');output=await downloadImage('fallback-203.png');png(output.bytes,812,1218,203);eq(await decodedPixels(output.bytes),[[0,0,0,255],[255,255,255,255]]);
 await page.selectOption('#printerDpi','300');ok((await page.locator('#imageDimensions').textContent()).includes('1200 × 1800'));output=await downloadImage('native-300.png');png(output.bytes,1200,1800,300);
 await page.selectOption('#printerDpi','600');output=await downloadImage('native-600.png');png(output.bytes,2400,3600,600);
 // Two included labels download once, as a ZIP containing ordered PNGs with DPI data.
 await page.reload({waitUntil:'networkidle'});await page.setInputFiles('#file',{name:'תוויות.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture[1])});await ready();await page.locator('#imageOptions').click();output=await downloadImage('all-images.zip');ok(output.name.endsWith('-203dpi.zip'));const files=unzip(output.bytes);eq(files.map(f=>f.name),['תוויות-4x6-label-01-203dpi.png','תוויות-4x6-label-02-203dpi.png']);for(const file of files)png(file.data,812,1218,203);ok(!files[0].data.equals(files[1].data),'Each PNG contains its own label');
 await page.uncheck('#includeLabel');await ready();output=await downloadImage('only-second.png');png(output.bytes,812,1218,203);eq(output.bytes,files[1].data);
 await page.selectOption('#labelNumber','label-2');await ready();await page.uncheck('#includeLabel');await page.waitForFunction(()=>document.getElementById('batchSummary').textContent.startsWith('0 labels'));eq(await page.locator('#downloadImage').isDisabled(),true);
 await page.check('#includeLabel');await ready();await page.selectOption('#paper','6x4');await ready();output=await downloadImage('landscape.png');png(output.bytes,1218,812,203);
 for(const [width,height] of [[375,667],[393,852],[412,839],[1280,900]]){await page.setViewportSize({width,height});eq(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);eq(await page.locator('.card').evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);await page.screenshot({path:`label-print-${width}.png`,fullPage:true});}
 // The same image route works in the portal iframe and uses an actual download.
 await page.goto(`${BASE}/`,{waitUntil:'networkidle'});const home=page.frameLocator('#shellFrame');await home.locator('.tab[data-page="1"]').click();await home.locator('a.tool[href="/label-cropper/"]').click();await page.waitForURL(`${BASE}/label-cropper/`);const tool=page.frameLocator('#shellFrame');await tool.locator('#file').setInputFiles({name:'fine-bars.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture[0])});await tool.locator('#download:not([disabled])').waitFor({state:'visible'});await tool.locator('#imageOptions').click();const event=page.waitForEvent('download');await tool.locator('#downloadImage').click();const d=await event,target=path.join(scratch,'iframe.png');await d.saveAs(target);png(fs.readFileSync(target),812,1218,203);
 eq(sent,[]);eq(errors,[]);console.log(`${checks} printer PNG checks passed: native one-dot barcode detail, exact dimensions/DPI/CRC, 1-bit black and white, preserved shades, fallback, 203/300/600 dpi, ZIP contents, inclusion, landscape, mobile and portal downloads.`);
}finally{fs.rmSync(scratch,{recursive:true,force:true});await context.close();await browser.close();}
