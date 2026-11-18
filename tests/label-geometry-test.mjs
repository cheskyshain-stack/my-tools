import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../label-cropper/index.html',import.meta.url),'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(html.split('/* LABEL_GEOMETRY_START */')[1].split('/* LABEL_GEOMETRY_END */')[0],ctx);const G=ctx.LabelGeometry;let checks=0;
for(const [w,h] of [[554,378],[100,400],[500,75]])for(const rotation of [0,90,180,270])for(const [pw,ph] of [[288,432],[432,288]]){
 const l=G.layout(w,h,rotation,pw,ph),a=l.degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),points=[[0,0],[l.width,0],[0,l.height],[l.width,l.height]].map(([x,y])=>[l.x+x*c-y*s,l.y+x*s+y*c]);
 for(const [x,y] of points)assert.ok(x>=-1e-8&&x<=pw+1e-8&&y>=-1e-8&&y<=ph+1e-8);
 assert.ok(Math.abs(l.width/w-l.height/h)<1e-8,'Never stretches the label');checks++;
}
assert.equal(G.bestRotation({w:550,h:370},288,432),90);checks++;
assert.equal(G.bestRotation({w:378,h:554},288,432),0);checks++;
assert.ok(!html.includes('\u2014'));checks++;
console.log(`${checks} label fit and rotation checks passed.`);
