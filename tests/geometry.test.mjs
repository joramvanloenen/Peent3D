import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareScene,buildBVH} from '../src/geometry.js';
test('nonindexed geometry, UVs and BVH cover all triangles',()=>{
  const result=prepareScene(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial()),'Cube');
  assert.equal(result.triangleCount,12);
  const g=result.geometry;
  assert.equal(g.getAttribute('position').count,36);
  assert.equal(g.getAttribute('uv').count,36);
  const curvature=g.getAttribute('aCurvature');
  for(let i=0;i<curvature.count;i++)assert.ok(Number.isFinite(curvature.getX(i)));
  const bvh=buildBVH(g);
  assert.equal(bvh.triangleCount,12);
  assert.ok(bvh.nodeCount>=1);
  bvh.dispose();
});
test('missing UVs get a unique triangle-atlas fallback',()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const result=prepareScene(new THREE.Mesh(g,new THREE.MeshStandardMaterial()),'Triangle');
  assert.equal(result.triangleCount,1);
  assert.equal(result.missingUVs,true);
  const uv=result.geometry.getAttribute('uv');
  assert.equal(uv.count,3);
  for(let i=0;i<uv.count;i++){
    assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1);
    assert.ok(uv.getY(i)>=0&&uv.getY(i)<=1);
  }
});

test('a cube has shared convex edges but no false concave diagonals',()=>{
  const result=prepareScene(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial()),'Cube');
  assert.ok(result.edgeStats.convex>=12,'Should detect the 12 real convex cube edges');
  assert.equal(result.edgeStats.concave,0,'A closed convex box must not contain concave edges');
  const a=result.geometry.getAttribute('aEdgeAngles');
  const alt=result.geometry.getAttribute('aEdgeAltitude');
  const bary=result.geometry.getAttribute('aBarycentric');
  assert.equal(a.count,result.geometry.getAttribute('position').count);
  assert.equal(alt.count,a.count);
  for(let i=0;i<a.count;i++){
    for(let k=0;k<3;k++){
      assert.ok(Number.isFinite(a.getComponent(i,k)));
      assert.ok(alt.getComponent(i,k)>=0);
    }
    assert.equal(bary.getX(i)+bary.getY(i)+bary.getZ(i),1);
  }
});
test('a flat triangulated plane does not produce false convex wear',()=>{
  const geometry=new THREE.PlaneGeometry(2,2,3,3);
  const result=prepareScene(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),'Plane');
  assert.equal(result.edgeStats.convex,0);
  assert.equal(result.edgeStats.concave,0);
});
