import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createDemoMesh,prepareScene} from '../src/geometry.js';
const shader=name=>readFileSync(new URL('../src/shaders/'+name,import.meta.url),'utf8');
const gpu=readFileSync(new URL('../src/gpu.js',import.meta.url),'utf8');

test('every mesh triangle records its own UV centroid for conservative baking',()=>{
 const model=createDemoMesh(),geo=model.geometry;
 const uv=geo.getAttribute('uv'),centroid=geo.getAttribute('aUvCentroid');
 assert.ok(centroid,'Missing per-triangle UV centroid');
 assert.equal(centroid.count,uv.count);
 for(let i=0;i<uv.count;i+=3){
   const center=new THREE.Vector2(
    (uv.getX(i)+uv.getX(i+1)+uv.getX(i+2))/3,
    (uv.getY(i)+uv.getY(i+1)+uv.getY(i+2))/3);
   for(let k=0;k<3;k++){
     assert.ok(Math.abs(centroid.getX(i+k)-center.x)<1e-6);
     assert.ok(Math.abs(centroid.getY(i+k)-center.y)<1e-6);
   }
 }
});

test('subpixel UV triangles expand instead of leaving uncovered vertex tips',()=>{
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0,1,0,0,0,1,0
 ],3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute([
  0,0,1,0,0,1,0,0,1
 ],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([
  .5,.5,.50006,.5,.5,.50003
 ],2));
 const model=prepareScene(new THREE.Mesh(g,new THREE.MeshStandardMaterial()),'Narrow corner');
 const uv=model.geometry.getAttribute('uv');
 const center=model.geometry.getAttribute('aUvCentroid');
 const scale=1/2048;
 const triangle=[];
 for(let i=0;i<3;i++){
   const u=new THREE.Vector2(uv.getX(i),uv.getY(i));
   const mid=new THREE.Vector2(center.getX(i),center.getY(i));
   const dir=u.clone().sub(mid).normalize();
   triangle.push(u.addScaledVector(dir,.72*scale));
 }
 const area=(a,b,c)=>Math.abs(b.x-a.x)*(c.y-a.y)*.5;
 assert.ok(area(...triangle)>area(new THREE.Vector2(.5,.5),
  new THREE.Vector2(.50006,.5),new THREE.Vector2(.5,.50003))*10);
 const vert=shader('uv.vert.glsl');
 assert.match(vert,/aUvCentroid/);
 assert.match(vert,/uUVTexel/);
 assert.match(vert,/coveredUV=uv\+uUVTexel\*uvDirection\*\.72/);
});

test('mesh-map baker pads only uncovered texels and propagates RGBA validity before ray tracing',()=>{
 const pad=shader('pad.frag.glsl');
 assert.match(pad,/if\(center\.a>\.5\)\{frag=center;return;\}/);
 assert.match(pad,/if\(p\.a>\.5&&d<dist\)/);
 assert.match(gpu,/_padBakeMap\(this\.maps\[name\],3\)/);
 assert.match(gpu,/this\.maps\[name\]=this\._padBakeMap\(this\.maps\[name\],4\)/);
 const raster=gpu.indexOf('this._bakeRaster();');
 const rays=gpu.indexOf('this._bakeRays();');
 assert.ok(raster>=0&&raster<rays,'Valid UV padding must precede ray tracing');
});

test('AO is stitched at its baked map source, not just at the final smart mask',()=>{
 const rays=gpu.indexOf('this._stitchScalarMap(this.maps.ao,this.maps.ao.width);');
 const compositing=gpu.indexOf('this.compose();',rays);
 assert.ok(rays>=0&&compositing>rays);
 const stitch=shader('seam-stitch.frag.glsl');
 assert.match(stitch,/float own=source\.r;/);
 assert.match(stitch,/frag=source;return;/);
 assert.match(stitch,/source\.a\);/);
 assert.match(stitch,/mix\(own,average,clamp\(influence,0\.,1\.\)\*\.5\)/);
});

test('AO generator normalizes bilinear samples by their validity alpha',()=>{
 const smart=shader('smart.frag.glsl');
 assert.match(smart,/aoTexel\.r\/aoTexel\.a/);
 assert.match(smart,/aoTexel\.a>\.0001/);
 const sample=(r,a)=>a>.0001?Math.max(0,Math.min(1,r/a)):1;
 assert.ok(Math.abs(sample(.38,.5)-.76)<1e-7);
 assert.equal(sample(0,0),1,'Invalid atlas background is not a 100% occluded surface');
});
