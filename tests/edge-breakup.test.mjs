import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shader=readFileSync(new URL('../src/shaders/smart.frag.glsl',import.meta.url),'utf8');
function smoothstep(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
function band(position,width,coverage){
 const halfWidth=Math.min(2,Math.max(.01,width))*.5;
 const centre=Math.min(1,Math.max(0,position));
 const lo=centre-halfWidth,hi=centre+halfWidth;
 const feather=Math.min(.085,(hi-lo)*.22);
 return smoothstep(lo,lo+feather,coverage)*(1-smoothstep(hi-feather,hi,coverage));
}
test('default edge-wear breakup leaves fully worn edge core untouched',()=>{
  assert.equal(band(.53,.63,1),0);
});
test('breakup position 1 reaches exact 100 percent edge core',()=>{
  assert.ok(band(1,.3,1)>.99);
  assert.ok(band(1,.01,1)>.99);
});
test('full-width band can cover entire unworn-to-worn interval',()=>{
  assert.ok(band(.5,2,0)>.99);
  assert.ok(band(.5,2,1)>.99);
});
test('position 0 reaches the completely unworn border',()=>{
  assert.ok(band(0,.3,0)>.99);
});
test('GLSL band must not clamp the upper bound below 1',()=>{
  assert.match(shader,/float lo=centre-halfWidth;/);
  assert.match(shader,/float hi=centre\+halfWidth;/);
  assert.doesNotMatch(shader,/clamp\(uBreakupPosition\+halfWidth,lo\+/);
});
