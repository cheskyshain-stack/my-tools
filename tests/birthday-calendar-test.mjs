import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
process.env.TZ='America/New_York';
const html=fs.readFileSync(new URL('../birthday/index.html',import.meta.url),'utf8'),context={};
vm.createContext(context);vm.runInContext(html.split('/* BIRTHDAY_CALENDAR_START */')[1].split('/* BIRTHDAY_CALENDAR_END */')[0],context);
const C=context.BirthdayCalendar,DAY=86400000,EPOCH=Date.UTC(1899,11,30),serial=iso=>(Date.parse(iso+'T00:00:00Z')-EPOCH)/DAY;
let checks=0;
const eq=(a,b)=>{assert.equal(a,b);checks++;};
const item=(extra={})=>({id:'test',name:'Birthday',calendar:'english',month:11,day:18,year:null,adar:'second',february:'feb28',...extra});
const format=new Intl.DateTimeFormat('en-US-u-ca-hebrew',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}),names={Nisan:1,Iyar:2,Sivan:3,Tamuz:4,Av:5,Elul:6,Tishri:7,Heshvan:8,Kislev:9,Tevet:10,Shevat:11,Adar:12,'Adar I':13,'Adar II':14};
let dates=0;
for(let t=Date.parse('1900-01-01T00:00:00Z');t<Date.parse('2101-01-01T00:00:00Z');t+=13*DAY){
 const d=new Date(t),s=(t-EPOCH)/DAY,h=C.hebrew(s),expected=Object.fromEntries(format.formatToParts(d).map(p=>[p.type,p.value]));
 assert.equal(h.dayOfMonth,Number(expected.day));assert.equal(h.year,Number(expected.year));assert.equal(h.month,names[expected.month]);assert.equal(C.hebrewDate(h.year,h.month,h.dayOfMonth),s);dates++;
}
checks++;
eq(C.next(item(),serial('2026-11-18')).days,0);
eq(C.next(item({day:19}),serial('2026-11-18')).days,1);
eq(C.next(item({day:17}),serial('2026-11-18')).serial,serial('2027-11-17'));
eq(C.next(item({year:2000}),serial('2026-11-18')).age,26);
eq(C.next(item({month:1,day:1}),serial('2026-12-31')).days,1);
eq(C.next(item({month:2,day:29}),serial('2027-02-27')).serial,serial('2027-02-28'));
eq(C.next(item({month:2,day:29,february:'mar1'}),serial('2027-02-27')).serial,serial('2027-03-01'));
eq(C.next(item({month:2,day:29}),serial('2028-02-27')).serial,serial('2028-02-29'));
eq(C.next(item({calendar:'hebrew',month:9,day:8}),serial('2026-11-18')).days,0);
eq(C.next(item({calendar:'hebrew',month:12,day:14}),serial('2026-11-18')).month,14);
eq(C.next(item({calendar:'hebrew',month:12,day:14,adar:'first'}),serial('2026-11-18')).month,13);
const commonStart=C.hebrewDate(5786,7,1);
eq(C.next(item({calendar:'hebrew',month:14,day:14}),commonStart).month,12);
eq(C.next(item({calendar:'hebrew',month:13,day:30}),commonStart).serial,C.hebrewDate(5786,11,30));
for(const m of [8,9]){
 const year=Array.from({length:30},(_,i)=>5770+i).find(y=>C.hebrewDate(y,m,30)===null),n=C.next(item({calendar:'hebrew',month:m,day:30}),C.hebrewDate(year,7,1));
 eq(n.serial,C.hebrewDate(year,m+1,1));assert.match(n.note,/No 30/);checks++;
}
for(const invalid of [{month:4,day:31},{month:2,day:29,year:2023},{year:2027},{calendar:'hebrew',month:13,year:5786},{calendar:'hebrew',year:5784,month:12},{year:NaN}]){
 assert.throws(()=>C.validate(item(invalid),serial('2026-11-18')));checks++;
}
eq(C.validate(item({name:'  Miriam  '}),serial('2026-11-18')).name,'Miriam');
eq(C.validate(item({calendar:'hebrew',month:14,day:15,year:5784}),serial('2026-11-18')).year,5784);
function duration(birthday,when){const now=new Date(when);return C.duration(birthday,C.next(birthday,C.serial(now)),now);}
let split=duration(item({month:12,day:20}),'2026-11-18T10:00:00-05:00');
eq(split.months,1);eq(split.days,1);eq(split.hours,14);
split=duration(item({month:12,day:18}),'2026-11-18T00:00:00-05:00');eq(split.months,1);
split=duration(item({month:12,day:18}),'2026-11-18T00:00:01-05:00');eq(split.months,0);eq(split.days,29);eq(split.hours,23);eq(split.minutes,59);
eq(duration(item({month:2,day:28}),'2027-01-31T00:00:00-05:00').months,1);
eq(duration(item({month:2,day:28}),'2027-01-31T12:00:00-05:00').months,0);
split=duration(item({month:3,day:15}),'2027-03-13T12:00:00-05:00');eq(split.days,1);eq(split.hours,11);
split=duration(item({month:11,day:8}),'2027-11-06T12:00:00-04:00');eq(split.days,1);eq(split.hours,13);
eq(duration(item({day:19}),'2026-11-18T23:59:30-05:00').underMinute,true);
eq(duration(item({day:19}),'2026-11-19T00:00:00-05:00').today,true);
const shevat30=C.localDate(C.hebrewDate(5787,11,30));
eq(C.serial(C.addMonths(shevat30,1,'hebrew')),C.hebrewDate(5787,13,30));
eq(C.serial(C.addMonths(shevat30,2,'hebrew')),C.hebrewDate(5787,14,29));
eq(C.serial(C.addMonths(shevat30,3,'hebrew')),C.hebrewDate(5787,1,30));
split=duration(item({calendar:'hebrew',month:1,day:30}),shevat30);
eq(split.months,3);eq(split.days,0);
const born=item({month:3,day:25,year:2024,birthTime:'daytime',viewCalendar:'hebrew'});
let converted=C.birthdayIn(born,'hebrew');eq(converted.year,5784);eq(converted.month,14);eq(converted.day,15);
eq(C.birthdayIn(born,'english').day,25);
converted=C.birthdayIn({...born,birthTime:'evening'},'hebrew');eq(converted.day,16);
eq(C.birthdayIn({...born,birthTime:'afterMidnight'},'hebrew').day,15);
let reversed=C.birthdayIn(item({calendar:'hebrew',month:14,day:15,year:5784,birthTime:'evening'}),'english');
eq(reversed.year,2024);eq(reversed.month,3);eq(reversed.day,24);
eq(C.birthdayIn(item({year:null,birthTime:'daytime'}),'hebrew'),null);
eq(C.birthdayIn(item({year:2000,birthTime:null}),'hebrew'),null);
eq(C.next(C.birthdayIn(born,'english'),serial('2026-11-18')).serial,serial('2027-03-25'));
eq(C.next(C.birthdayIn(born,'hebrew'),serial('2026-11-18')).serial,C.hebrewDate(5787,14,15));
const normalized=C.validate(born,serial('2026-11-18'));eq(normalized.calendar,'english');eq(normalized.viewCalendar,'hebrew');eq(normalized.day,25);
eq(C.selected(normalized).day,15);eq(C.selected(normalized).calendar,'hebrew');
eq(C.validate(item({viewCalendar:'hebrew'}),serial('2026-11-18')).viewCalendar,'english');
// Evening conversions round-trip across the English year boundary.
const january=item({year:2020,month:12,day:31,birthTime:'evening'}),hebrewJanuary=C.birthdayIn(january,'hebrew');
reversed=C.birthdayIn(hebrewJanuary,'english');eq(reversed.year,2020);eq(reversed.month,12);eq(reversed.day,31);
assert.ok(!html.includes('\u2014'));checks++;
console.log(`${checks} birthday calendar checks passed, including ${dates} independent Gregorian/Hebrew reference dates.`);
