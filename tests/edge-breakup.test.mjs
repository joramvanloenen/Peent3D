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

test('edge-wear contrast is applied after combining soft distance and grunge',()=>{
  const start=shader.indexOf('if(uMask==1){\n   if(uBreakup>0.)result=transitionBreakup(result,fine,convex);');
  assert.ok(start>=0,'Edge wear should combine grunge first');
  const section=shader.slice(start,start+260);
  assert.match(section,/transitionBreakup\(result,fine,convex\);\s*result=clamp\(\(result-\.5\)\*uContrast\+\.5,0\.,1\.\);/);
  assert.match(shader,/convex=softWearDistance\(edges\.r,uEdgeDistance,uSoftness\)/);
  assert.match(shader,/float breakupNoise=smoothstep\(\.5-softness,\.5\+softness,grunge\)/);
});

test('soft breakup shifts the final contrast threshold rather than being multiplied afterward',()=>{
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const contrast=(v,c)=>Math.max(0,Math.min(1,(v-.5)*c+.5));
  const combine=(wear,noise,intensity,band)=>wear*(1-intensity*band*(1-noise));
  const edge=.65,noise=.55,intensity=.82,edgeBand=1,boost=4;
  const correct=contrast(combine(edge,noise,intensity,edgeBand),boost);
  const old=combine(contrast(edge,boost),noise,intensity,edgeBand);
  assert.ok(correct<old-.3,'Final contrast should sharpen the combined pattern instead of retaining a soft multiplied halo');
  assert.equal(contrast(combine(1,0,1,1),boost),0,'At full breakup the core can be erased before contrast');
  assert.equal(contrast(combine(1,0,1,0),boost),1,'Outside the breakup band the core remains intact');
  assert.ok(smooth(0,1,.5)>0&&smooth(0,1,.5)<1,'Soft distance field retains intermediate coverage');
});
