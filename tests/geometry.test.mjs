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
