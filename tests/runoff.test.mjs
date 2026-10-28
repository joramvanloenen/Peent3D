import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareScene} from '../src/geometry.js';
import {buildRunoffAtlas} from '../src/runoff.js';

const from=geometry=>buildRunoffAtlas(geometry,{maxParticles:600,maxTraceSteps:80});
function extract(atlas,triangleCount){
 const view=atlas.texture.image.data,records=[];
 for(let t=0;t<triangleCount;t++){
   const start=t*atlas.stride;
   const count=Math.round(view[start*4]);
   for(let j=0;j<count;j++){
     const i=(start+1+j*3)*4;
     const a=new THREE.Vector3(view[i],view[i+1],view[i+2]);
     const b=new THREE.Vector3(view[i+4],view[i+5],view[i+6]);
     records.push({tri:t,a,b,arc:view[i+3],seed:view[i+7],total:view[i+9],angle:view[i+10]});
   }
 }
 return records;
}
test('a cube emits runoff ONLY from top geometry ledges and traces down its wall faces',()=>{
 const scene=prepareScene(new THREE.Mesh(new THREE.BoxGeometry(2,2,2)),'Cube');
 const atlas=from(scene.geometry);
 assert.ok(atlas.stats.sources>=4,'Expected upper cube rim edges');
 assert.ok(atlas.stats.particles>0,'Expected droplet particles on upper ledges');
 const paths=extract(atlas,scene.triangleCount);
 assert.ok(paths.length>10,'Expected multiple nonzero downward trace segments');
 const maxY=scene.geometry.boundingBox.max.y;
 for(const s of paths){
   assert.ok(s.b.y<=s.a.y+1e-5,'Runoff cannot travel uphill');
   assert.ok(s.b.distanceTo(s.a)>0.001,'Segments must have nonzero length');
   assert.ok(s.arc>=0&&s.total>=s.arc,'Arc starts at a source edge');
   assert.ok(s.angle>=16,'A genuine upper edge requires a nonzero dihedral');
 }
 const roots=paths.filter(s=>s.arc<1e-5);
 assert.ok(roots.length>0);
 assert.ok(roots.every(s=>Math.abs(s.a.y-maxY)<.02),'Every drip must start on an actual upper ledge');
 atlas.dispose();
});
test('horizontal surfaces never generate vertical drips in the middle of the face',()=>{
 const scene=prepareScene(new THREE.Mesh(new THREE.PlaneGeometry(2,2,6,6)),'Horizontal floor');
 const atlas=from(scene.geometry);
 assert.equal(atlas.stats.sources,0);
 assert.equal(atlas.stats.particles,0);
 assert.equal(extract(atlas,scene.triangleCount).length,0);
 atlas.dispose();
});
test('a triangulated vertical wall has source emitters on its TOP open boundary only',()=>{
 const g=new THREE.PlaneGeometry(2,2,6,6);
 g.rotateX(-Math.PI/2);
 // Rotate to the vertical X/Y plane, with top y=1.
 g.rotateX(Math.PI/2);
 // Base PlaneGeometry faces X/Y already; no rotation required after cancellation.
 const scene=prepareScene(new THREE.Mesh(g),'Wall');
 const atlas=from(scene.geometry);
 assert.ok(atlas.stats.sources>0);
 const maxY=scene.geometry.boundingBox.max.y;
 const roots=extract(atlas,scene.triangleCount).filter(s=>s.arc<1e-5);
 assert.ok(roots.length>0);
 assert.ok(roots.every(s=>Math.abs(s.a.y-maxY)<.02),'No drips may start at an internal triangulation edge');
 atlas.dispose();
});
test('separate disconnected meshes do not transfer particle trails between each other',()=>{
 const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
 a.position.x=-2;
 const b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
 b.position.x=2;
 const scene=prepareScene(new THREE.Group().add(a,b),'Disconnected boxes');
 const atlas=from(scene.geometry);
 assert.ok(atlas.stats.sources>=8);
 for(const seg of extract(atlas,scene.triangleCount)){
   assert.equal(Math.sign(seg.a.x),Math.sign(seg.b.x));
 }
 atlas.dispose();
});
test('runoff seeded paths survive UV seams and never spawn from coplanar triangle edges',()=>{
 const scene=prepareScene(new THREE.Mesh(new THREE.BoxGeometry(2,2,2)),'UV split cube');
 const atlas=from(scene.geometry);
 assert.equal(atlas.stats.sources,4,'Only upper perimeter edges seed drips');
 assert.equal(atlas.stats.overflowTriangles,0,'Cube should not overflow candidate slots');
 atlas.dispose();
});
