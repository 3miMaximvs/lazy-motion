import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../host/main.jsx',import.meta.url),'utf8');
function property(value, keys=[]) {
  return {value,keys:keys.map(v=>structuredClone(v)),numKeys:keys.length,isTimeVarying:keys.length>0,expressionEnabled:false,
    setValue(v){this.value=Array.isArray(v)?[...v]:v;},keyValue(i){return structuredClone(this.keys[i-1]);},setValueAtKey(i,v){this.keys[i-1]=v;}};
}
function layer(index,options={}) {
  const ap=property([50,25]),pos=property([200,100]),scale=property([100,100]),rotation=property(0);
  const properties={'ADBE Anchor Point':ap,'ADBE Position':pos,'ADBE Scale':scale,'ADBE Rotate Z':rotation};
  let startTime=0;
  const item={index,name:`Layer ${index}`,inPoint:0,outPoint:index,locked:false,threeDLayer:false,stretch:100,hasVideo:true,autoOrient:0,
    source:{duration:100,mainSource:{isStill:true}},property:()=>({property:name=>properties[name]}),sourceRectAtTime:()=>({left:0,top:0,width:100,height:50}),properties,...options};
  Object.defineProperty(item,'startTime',{get(){return startTime;},set(value){const delta=value-startTime;this.inPoint+=delta;this.outPoint+=delta;startTime=value;}});
  return item;
}
function host(layers,options={}) {
  class CompItem {}
  const comp=Object.assign(new CompItem(),{name:'Test',frameRate:25,frameDuration:.04,duration:30,time:0,selectedLayers:layers},options);
  const undo=[];
  const context=vm.createContext({CompItem,AutoOrientType:{NO_AUTO_ORIENT:0},app:{version:'26.0',project:{activeItem:comp},beginUndoGroup:name=>undo.push(name),endUndoGroup:()=>undo.push('end')}});
  vm.runInContext(code,context);
  return {comp,undo,run:(command,args={})=>JSON.parse(vm.runInContext(`LazyMotion.dispatch(${JSON.stringify(command)},${JSON.stringify(args)})`,context))};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('cascade follows timeline order, preserves trimmed lengths and moves starts',()=>{
  const a=layer(1,{inPoint:1,outPoint:2.5}),b=layer(2,{inPoint:3,outPoint:5}),c=layer(4,{inPoint:.5,outPoint:1.5});
  const h=host([c,a,b]);const r=h.run('cascade',{order:'forward'});assert.equal(r.ok,true);
  near(a.inPoint,1);near(b.inPoint,a.outPoint);near(c.inPoint,b.outPoint);near(c.outPoint-c.inPoint,1);
  assert.deepEqual(h.undo,['Lazy Motion · Cascade','end']);
});
test('reverse cascade begins at the first layer in reverse order',()=>{
  const a=layer(1),b=layer(2,{inPoint:5,outPoint:7});const h=host([a,b]);
  assert.equal(h.run('cascade',{order:'reverse'}).ok,true);near(b.inPoint,5);near(a.inPoint,7);
});
test('locked layer rejects the entire selection before any write',()=>{
  const a=layer(1),b=layer(2,{locked:true});const h=host([a,b]);
  assert.equal(h.run('cascade',{order:'forward'}).ok,false);assert.equal(a.startTime,0);assert.equal(h.undo.length,0);
});
test('cascade cannot hide the end beyond the composition',()=>{
  const a=layer(1),b=layer(2);const h=host([a,b],{duration:2});
  assert.equal(h.run('cascade',{order:'forward'}).ok,false);assert.equal(b.startTime,0);assert.equal(h.undo.length,0);
});
test('duration trims out points, preserves in/start/stretch',()=>{
  const a=layer(1,{inPoint:2,outPoint:3,stretch:50}),b=layer(2);const h=host([a,b]);
  assert.equal(h.run('duration',{value:50,unit:'frames'}).ok,true);near(a.outPoint,4);near(b.outPoint,2);near(a.inPoint,2);near(a.startTime,0);assert.equal(a.stretch,50);
});
test('seconds round to whole frames at fractional FPS',()=>{
  const a=layer(1);const fd=1001/30000;const h=host([a],{frameRate:1/fd,frameDuration:fd});
  const r=h.run('duration',{value:1,unit:'seconds'});assert.equal(r.ok,true);assert.equal(r.data.frames,30);near(a.outPoint,1.001);
});
test('invalid durations and unknown units are rejected without writes',()=>{
  for(const args of [{value:0,unit:'frames'},{value:-2,unit:'frames'},{value:1.2,unit:'frames'},{value:'50',unit:'frames'},{value:.001,unit:'seconds'},{value:10,unit:'minutes'}]) {
    const a=layer(1);const h=host([a]);assert.equal(h.run('duration',args).ok,false);near(a.outPoint,1);assert.equal(h.undo.length,0);
  }
});
test('finite source too short rejects all layers',()=>{
  const a=layer(1),b=layer(2,{source:{duration:2,mainSource:{isStill:false}}});const h=host([a,b]);
  const r=h.run('duration',{value:100,unit:'frames'});assert.equal(r.ok,false);assert.match(r.error,/source/);near(a.outPoint,1);
});
test('all nine anchors account for source rectangle offset',()=>{
  for(let y=0;y<=1;y+=.5)for(let x=0;x<=1;x+=.5){
    const a=layer(1,{sourceRectAtTime:()=>({left:-20,top:-10,width:100,height:50})});const h=host([a]);
    assert.equal(h.run('anchor',{x,y}).ok,true);const anchor=a.properties['ADBE Anchor Point'].value;
    near(anchor[0],-20+100*x);near(anchor[1],-10+50*y);
    const pos=a.properties['ADBE Position'].value;near(pos[0]-anchor[0],150);near(pos[1]-anchor[1],75);
  }
});
test('anchor compensates nonuniform and mirrored scale, rotation and keyed position',()=>{
  const a=layer(1);a.properties['ADBE Scale'].value=[-200,50];a.properties['ADBE Rotate Z'].value=90;
  a.properties['ADBE Position']=property([200,100],[[200,100],[300,200]]);
  const h=host([a]);assert.equal(h.run('anchor',{x:0,y:0}).ok,true);
  const pos=a.properties['ADBE Position'];near(pos.keys[0][0],212.5);near(pos.keys[0][1],200);near(pos.keys[1][0],312.5);near(pos.keys[1][1],300);
});
test('separated position dimensions are compensated',()=>{
  const a=layer(1),x=property(200),y=property(100);a.properties['ADBE Position'].dimensionsSeparated=true;
  a.properties['ADBE Position'].getSeparationFollower=i=>i===0?x:y;
  assert.equal(host([a]).run('anchor',{x:1,y:1}).ok,true);near(x.value,250);near(y.value,125);
});
test('3D, animated rotation and expression-driven position are rejected before writes',()=>{
  for(const mode of ['3d','rotation','expression','collapse','autoOrient']){
    const a=layer(1),b=layer(2);
    if(mode==='3d')b.threeDLayer=true;
    if(mode==='rotation')b.properties['ADBE Rotate Z'].isTimeVarying=true;
    if(mode==='expression')b.properties['ADBE Position'].expressionEnabled=true;
    if(mode==='collapse')b.collapseTransformation=true;
    if(mode==='autoOrient')b.autoOrient=1;
    const h=host([a,b]);assert.equal(h.run('anchor',{x:0,y:0}).ok,false);
    assert.deepEqual(a.properties['ADBE Anchor Point'].value,[50,25]);assert.equal(h.undo.length,0);
  }
});
test('unexpected write failure rolls back previous changes and closes undo group',()=>{
  const a=layer(1),b=layer(2);let out=2;Object.defineProperty(b,'outPoint',{get:()=>out,set(v){if(v===4)throw new Error('simulated failure');out=v;}});
  const h=host([a,b]);const r=h.run('duration',{value:100,unit:'frames'});assert.equal(r.ok,false);near(a.outPoint,1);near(b.outPoint,2);assert.equal(h.undo.at(-1),'end');assert.match(r.error,/rétablies/);
});
test('unexpected anchor write failure restores both anchor and position',()=>{
  const a=layer(1),b=layer(2);const pos=b.properties['ADBE Position'];const original=pos.setValue;let first=true;pos.setValue=function(v){if(first){first=false;throw new Error('simulated');}original.call(this,v);};
  const h=host([a,b]);assert.equal(h.run('anchor',{x:0,y:0}).ok,false);
  for(const l of [a,b]){assert.deepEqual(l.properties['ADBE Anchor Point'].value,[50,25]);assert.deepEqual(l.properties['ADBE Position'].value,[200,100]);}
});
