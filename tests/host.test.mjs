import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const hostSource = readFileSync(new URL('../host/main.jsx', import.meta.url), 'utf8');
function probe(comp) {
  class CompItem {}
  const item = comp ? Object.assign(new CompItem(), comp) : null;
  const context = vm.createContext({ app: { version: '26.0', project: { activeItem: item } }, CompItem });
  vm.runInContext(hostSource, context);
  return command => JSON.parse(vm.runInContext(`LazyMotion.dispatch(${JSON.stringify(command)})`, context));
}
test('empty project returns a usable empty selection', () => {
  const result = probe(null)('selection');
  assert.deepEqual(result, {ok:true,data:{host:'26.0',comp:null,layers:[]}});
});
test('selection preserves names, sorts timeline order and rounds fractional frame arithmetic', () => {
  const name = 'Texte "cité" \\ chemin\nligne\t\u0001';
  const read = probe({name, frameRate:29.97002997, frameDuration:1001/30000, duration:20,
    selectedLayers:[{index:8,name,inPoint:1,outPoint:1+1001/30000*25,locked:true,threeDLayer:true},
      {index:2,name:'Précomp',inPoint:0,outPoint:1001/30000*30,locked:false,threeDLayer:false}]});
  const result=read('selection');
  assert.equal(result.ok,true);
  assert.equal(result.data.comp.name,name);
  assert.deepEqual(result.data.layers.map(l=>l.index),[2,8]);
  assert.equal(result.data.layers[1].name,name);
  assert.equal(result.data.layers[1].durationFrames,25);
  assert.equal(result.data.layers[1].locked,true);
  assert.equal(result.data.layers[1].threeD,true);
});
test('unknown command is rejected as a structured error', () => {
  const result=probe(null)('arbitrary');
  assert.equal(result.ok,false);
  assert.match(result.error,/inconnue/);
});
test('demo creation is not exposed by the installed panel', () => {
  assert.equal(probe(null)('demo').ok,false);
});
