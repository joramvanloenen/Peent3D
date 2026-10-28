import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareScene} from '../src/geometry.js';
import {bakeSignedMeanCurvature} from '../src/curvature.js';

function attributeValues(g,component=0){
  const a=g.getAttribute('aSignedMeanCurvature');
  assert.ok(a,'Signed mean curvature must be baked as a separate vertex attribute');
  const values=[];
  for(let i=0;i<a.count;i++)values.push(a.getComponent(i,component));
  return values;
}
const average=values=>values.reduce((sum,v)=>sum+v,0)/values.length;

test('flat planar mesh has neutral signed curvature at all smoothing scales',()=>{
  const result=prepareScene(new THREE.Mesh(new THREE.PlaneGeometry(3,3,5,5)));
  const attr=result.geometry.getAttribute('aSignedMeanCurvature');
  assert.equal(attr.itemSize,3);
  for(let i=0;i<attr.count;i++){
    for(let k=0;k<3;k++){
      const value=attr.getComponent(i,k);
      assert.ok(Number.isFinite(value));
      assert.ok(Math.abs(value-.5)<1e-4,'Planar curvature should be neutral: '+value);
    }
  }
  assert.ok(result.signedCurvatureStats.normalization>=1e-8);
});

test('outward closed sphere has positive convex mean curvature',()=>{
  const result=prepareScene(new THREE.Mesh(new THREE.SphereGeometry(1,32,20)));
  const samples=attributeValues(result.geometry);
  assert.ok(average(samples)>.56,'Sphere should predominantly be convex with outward normals');
  assert.ok(result.signedCurvatureStats.uniqueVertices<result.geometry.getAttribute('position').count,
    'UV seam vertices must weld geometrically');
  for(const k of [0,1,2]){
    assert.ok(attributeValues(result.geometry,k).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  }
});

test('reversing sphere winding reverses curvature sign',()=>{
  const g=new THREE.SphereGeometry(1,24,16).toNonIndexed();
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i+=3){
    const b=new THREE.Vector3().fromBufferAttribute(p,i+1);
    const c=new THREE.Vector3().fromBufferAttribute(p,i+2);
    p.setXYZ(i+1,c.x,c.y,c.z);
    p.setXYZ(i+2,b.x,b.y,b.z);
  }
  bakeSignedMeanCurvature(g);
  assert.ok(average(attributeValues(g))<.44,'Inward winding should produce negative curvature');
});

test('signed curvature agrees on duplicate UV seam vertices',()=>{
  const result=prepareScene(new THREE.Mesh(new THREE.SphereGeometry(1,20,12)));
  const g=result.geometry,p=g.getAttribute('position');
  const values=g.getAttribute('aSignedMeanCurvature');
  const seen=new Map();
  let matched=0;
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*100000)).join(',');
    const sample=[values.getX(i),values.getY(i),values.getZ(i)];
    if(seen.has(key)){
      const prev=seen.get(key);
      for(let channel=0;channel<3;channel++)assert.equal(sample[channel],prev[channel]);
      matched++;
    } else seen.set(key,sample);
  }
  assert.ok(matched>0);
});

test('degenerate triangles never produce NaN curvature or singular normalization',()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([
     0,0,0,1,0,0,2,0,0,
     0,0,0,0,1,0,1,0,0
  ],3));
  const result=bakeSignedMeanCurvature(g);
  assert.ok(result.normalization>0&&Number.isFinite(result.normalization));
  for(let k=0;k<3;k++)assert.ok(attributeValues(g,k).every(Number.isFinite));
});

test('two distinct but coincident meshes are not welded together',()=>{
  const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  const b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  const result=prepareScene(new THREE.Group().add(a,b));
  assert.ok(result.signedCurvatureStats.uniqueVertices>=16,
    'Mesh IDs should prevent welding vertices from two independent meshes');
});
