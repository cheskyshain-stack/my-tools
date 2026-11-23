import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const root=new URL('../',import.meta.url),html=fs.readFileSync(new URL('torah-codes/index.html',root),'utf8');
const js=html.split('/* TORAH_ELS_START */')[1].split('/* TORAH_ELS_END */')[0],box={performance};vm.createContext(box);vm.runInContext(js,box);const E=box.TorahELS;
const raw=fs.readFileSync(new URL('torah-codes/data/torah.json',root)),data=JSON.parse(raw),provenance=JSON.parse(fs.readFileSync(new URL('torah-codes/data/provenance.json',root)));
const c=E.build(data),hash=b=>createHash('sha256').update(b).digest('hex');let checks=0;function check(x,msg){checks++;assert(x,msg);}
check(hash(raw)===provenance.dataSHA256,'Data SHA');check(html.includes(provenance.dataSHA256),'UI pins the data hash');check(c.text.length===304805,'Standard scroll letter count');check(hash(c.text)===provenance.counts.standard.SHA256,'Letter hash');
const fixed=[
 'בראשיתבראאלהיםאתהשמיםואתהארץ',
 'והארץהיתהתהוובהווחשךעלפניתהוםורוחאלהיםמרחפתעלפניהמים',
 'ויאמראלהיםיהיאורויהיאור',
 'ויראאלהיםאתהאורכיטובויבדלאלהיםביןהאורוביןהחשך',
 'ויקראאלהיםלאוריוםולחשךקראלילהויהיערבויהיבקריוםאחד'
];
check(c.text.startsWith(fixed.join('')),'Five manually transcribed pesukim match exactly');
const opts={query:'תורה',from:0,to:197,min:50,max:50,direction:'forward',fold:false};
let r=E.search(c.text,opts);check(r.reason==='complete'&&r.matches.length===1&&r.matches[0].start===5&&r.matches[0].step===50,'Independently checked +50 תורה');
const fixture=[[5,1,1,6,'ת'],[55,1,2,28,'ו'],[105,1,4,3,'ר'],[155,1,5,8,'ה']];
for(const [index,ch,v,pos,letter]of fixture){const x=E.reference(c,index);check(x.book===0&&x.chapter===ch&&x.verse===v&&x.position===pos&&x.letter===letter,'Example exact letter reference '+index);}
r=E.search(c.text,{...opts,query:'הרות',direction:'backward'});check(r.matches.length===1&&r.matches[0].start===155&&r.matches[0].step===-50,'Independently checked reverse -50');
r=E.search(c.text,{...opts,query:'בְּ רֵאשִׁ֖ית!',min:1,max:1});check(r.matches.some(x=>x.start===0),'Nekudos, spaces and punctuation do not use positions');
r=E.search(c.text,{...opts,query:'ץוהארץ',min:1,max:1,to:80});check(r.matches.some(x=>x.start===27),'Cross-pasuk match');check(E.reference(c,32).verse===2&&E.reference(c,32).position===5,'Cross-pasuk end reference');
const lastWord=76;check(c.text.slice(lastWord,80)==='המים','Manually checked word at end of Gen 1:2');
r=E.search(c.text,{...opts,query:'מימ',from:76,to:80,min:1,max:1});check(r.matches.length===0,'Strict final mem differs');r=E.search(c.text,{...opts,query:'מימ',from:76,to:80,min:1,max:1,fold:true});check(r.matches.length===1&&r.matches[0].start===77,'Folded final mem matches');
check(E.normalize('ךםןףץ',true)==='כמנפצ','All five final forms');
check(E.search('ךםןףץ',{...opts,query:'כמנפצ',from:0,to:5,min:1,max:1,fold:true}).matches.length===1,'All final forms searched forward');
check(E.search('ךםןףץ',{...opts,query:'צפנמכ',from:0,to:5,min:1,max:1,fold:true,direction:'backward'}).matches.length===1,'All final forms searched backward');
check(E.search('ךםןףץ',{...opts,query:'כמנפצ',from:0,to:5,min:1,max:1,fold:false}).matches.length===0,'Strict search distinguishes all final forms');
for(let i=0;i<c.text.length;i++){const v=c.verses[c.verseOf[i]],offset=c.offsets[i];assert.equal(v.raw[offset],c.text[i]);assert(i>=v.start&&i<v.end);if(i===v.start)assert.equal(E.reference(c,i).position,1);}checks+=c.text.length;
check(E.reference(c,c.text.length-1).name==='Devarim'&&E.reference(c,c.text.length-1).chapter===34&&E.reference(c,c.text.length-1).verse===12,'Last Torah letter reference');
const ketiv=c.books[0].chapters[7][16];check(E.normalize(ketiv.raw).includes('הוצאאתך'),'Gen 8:17 written ketiv הוצא retained');check(!E.normalize(ketiv.raw).includes('היצא'),'Qere היצא not appended');
for(const [ref,expected]of [['Gen.4.13','מנשוא'],['Gen.7.11','מעינות'],['Gen.9.29','ויהי'],['Exod.25.31','תיעשה'],['Exod.28.26','האפוד'],['Num.1.17','בשמות'],['Num.10.10','חדשכם'],['Num.22.5','בעור'],['Deut.23.2','דכה']]){const [id,ch,v]=ref.split('.');const b=c.books.find(b=>b.id===id);check(E.normalize(b.chapters[+ch-1][+v-1].raw).includes(expected),ref+' standard scroll reading');}
// Independent exhaustive reference: iterate every letter and every signed skip.
const norm=(s,f)=>[...s].filter(c=>c>='א'&&c<='ת').map(c=>f?({'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}[c]||c):c).join('');
function brute(text,o){const q=norm(o.query,o.fold),t=norm(text,o.fold),out=[];for(let d=o.min;d<=o.max;d++)for(const sign of o.direction==='both'?[1,-1]:[o.direction==='forward'?1:-1])for(let start=o.from;start<o.to;start++){const step=d*sign,end=start+step*(q.length-1);if(end<o.from||end>=o.to)continue;if([...q].every((ch,k)=>t[start+k*step]===ch))out.push({start,step});}return out;}
let seed=20261123;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let trial=0;trial<350;trial++){const chars='אבגדהוכךמםנןףפץצ',s=Array.from({length:30+random(80)},()=>chars[random(chars.length)]).join(''),from=random(8),to=s.length-random(8),query=Array.from({length:2+random(6)},()=>chars[random(chars.length)]).join(''),min=1+random(3),o={query,from,to,min,max:min+random(15),direction:['both','forward','backward'][random(3)],fold:!!random(2),limit:100000};const a=JSON.parse(JSON.stringify(E.search(s,o).matches)),b=brute(s,o);assert.deepEqual(a,b,'Brute force trial '+trial);checks++;}
check(E.search('א'.repeat(500),{...opts,query:'אב',from:0,to:500,min:1,max:8,limit:500}).matches.length===0,'No false matches');
check(E.search('א'.repeat(1000),{...opts,query:'אא',from:0,to:1000,min:1,max:1,limit:5}).reason==='result-limit','Result cap reports incomplete');
let clock=0;check(E.search('א'.repeat(6000),{...opts,query:'אב',from:0,to:6000,min:1,max:2,milliseconds:1},()=>{},()=>clock+=2).reason==='time-limit','Time cap reports incomplete');
assert.throws(()=>E.plan('א'.repeat(40000),{...opts,query:'אב',from:0,to:40000,min:1,max:10000,direction:'both'}),/50 million/);checks++;
for(const bad of [{...opts,min:0},{...opts,max:10001},{...opts,query:'a'},{...opts,from:-1},{...opts,to:1e8}]){assert.throws(()=>E.plan(c.text,bad));checks++;}
E.validateMatch(c,{query:'תורה',start:5,step:50},0,197,false);assert.throws(()=>E.validateMatch(c,{query:'תורה',start:6,step:50},0,197,false));checks++;
// Regional searches are checked against the separate exhaustive implementation above.
for(let trial=0;trial<90;trial++){const chars='אבךכמםננןפףצץ',text=Array.from({length:35+random(50)},()=>chars[random(chars.length)]).join(''),query=Array.from({length:3},()=>chars[random(chars.length)]).join(''),o={query,min:1,max:7,direction:['forward','backward','both'][random(3)],fold:!!random(2)},regions=[{id:0,from:0,to:text.length},{id:1,from:5,to:text.length-4},{id:2,from:10,to:25}],messages=[];E.searchRegions(text,o,regions,m=>messages.push(m));for(const r of regions){const got=messages.find(m=>m.type==='region'&&m.id===r.id);assert.deepEqual(JSON.parse(JSON.stringify(got.matches)),brute(text,{...o,...r}),'Regional reference '+trial+'/'+r.id);checks++;}check(messages.at(-1).reason==='complete','Regional search completion');}
let events=[];E.searchRegions('ךםןףץ',{query:'כמנפצ',min:1,max:1,direction:'forward',fold:true},[{id:0,from:0,to:5}],m=>events.push(m));check(events.find(m=>m.type==='region').matches[0].start===0,'Regional final letters');
events=[];E.searchRegions('א'.repeat(400),{query:'אא',min:1,max:3,direction:'both',fold:false},[{id:0,from:0,to:400},{id:1,from:0,to:400}],m=>events.push(m));check(events.filter(m=>m.type==='region').every(m=>m.matches.length===100&&m.reason==='result-limit'),'Per-area result caps');check(events.at(-1).processed===2,'Result cap in one area does not skip later areas');
assert.throws(()=>E.searchRegions('א'.repeat(100),{query:'אב',min:1,max:1,direction:'forward',budget:150},[{id:0,from:0,to:100},{id:1,from:0,to:100}]),/Checking all results/);checks++;
events=[];let ticks=0;E.searchRegions('א'.repeat(400),{query:'אב',min:1,max:1,direction:'forward',milliseconds:1},[{id:0,from:0,to:400}],m=>events.push(m),()=>ticks+=2);check(events.at(-1).reason==='time-limit'&&events.at(-1).processed===0,'Global regional time limit reports unchecked areas');
console.log(`${checks} Torah engine, mapping, checksum and independent fixture checks passed.`);
