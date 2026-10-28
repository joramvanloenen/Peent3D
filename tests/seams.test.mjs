import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildUVSeamAtlas,mapAcrossUVSeam} from '../src/seams.js';

function square({split=true,meshIds=[0,0],mirror=false}={}){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0, 1,0,0, 1,1,0,
    0,0,0, 1,1,0, 0,1,0
  ],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(split?[
    .05,.05, .4,.05, .4,.4,
    ...(mirror?[.95,.6,.6,.95,.95,.95]:[.6,.6,.95,.95,.6,.95])
   ]:[
    0,0, 1,0, 1,1,
    0,0, 1,1, 0,1
  ],2));
  geometry.setAttribute('aMeshId',new THREE.Float32BufferAttribute([
    meshIds[0],meshIds[0],meshIds[0],meshIds[1],meshIds[1],meshIds[1]
  ],1));
  return geometry;
}
test('only matching physical edges with disconnected UVs become seam pairs',()=>{
 const g=square(),atlas=buildUVSeamAtlas(g);
 assert.equal(atlas.stats.pairedEdges,1);
 assert.equal(atlas.stats.directionalLinks,2,'Seam stitching must run on both islands');
 assert.equal(atlas.links[0].sourceTriangle,0);
 assert.equal(atlas.links[1].sourceTriangle,1);
 assert.equal(atlas.texture.image.data[0],1,'First triangle has one seam');
 assert.equal(atlas.texture.image.data[13*4],1,'Second triangle has one seam');
 atlas.dispose();
});
test('continuous UV triangle boundaries do not create a seam correction band',()=>{
 const atlas=buildUVSeamAtlas(square({split:false}));
 assert.equal(atlas.stats.pairedEdges,0);
 assert.equal(atlas.stats.directionalLinks,0);
 atlas.dispose();
});
test('touching geometry from different mesh objects must NEVER be stitched',()=>{
 const atlas=buildUVSeamAtlas(square({meshIds:[0,1]}));
 assert.equal(atlas.stats.pairedEdges,0);
 assert.equal(atlas.stats.directionalLinks,0);
 atlas.dispose();
});
test('matching UV seam ends map to the corresponding physical locations',()=>{
 const atlas=buildUVSeamAtlas(square());
 const first=atlas.links.find(s=>s.sourceTriangle===0);
 const midpoint=new THREE.Vector3(.5,.5,0);
 const target=mapAcrossUVSeam(first,midpoint,0,.006);
 assert.ok(target.x>.60&&target.x<.95);
 assert.ok(target.y>.60&&target.y<.95);
 assert.ok(target.distanceTo(new THREE.Vector2(.775,.775))>0,
   'Sampling at the seam must inset into the corresponding UV island');
 const reverse=atlas.links.find(s=>s.sourceTriangle===1);
 const backwards=mapAcrossUVSeam(reverse,midpoint,0,.006);
 assert.ok(backwards.x>.05&&backwards.x<.4);
 assert.ok(backwards.y>.05&&backwards.y<.4);
 atlas.dispose();
});
test('flipped UV islands still receive a valid inward seam mapping',()=>{
 const atlas=buildUVSeamAtlas(square({mirror:true}));
 assert.equal(atlas.stats.directionalLinks,2);
 const link=atlas.links.find(s=>s.sourceTriangle===0);
 const before=mapAcrossUVSeam(link,new THREE.Vector3(.5,.5,0),0,0);
 const after=mapAcrossUVSeam(link,new THREE.Vector3(.5,.5,0),0,.008);
 const towards=link.targetInward;
 assert.ok(after.clone().sub(before).dot(towards)>0,'Inset moves toward the opposite triangle interior');
 atlas.dispose();
});
test('open mesh edges are not considered UV island seams',()=>{
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
 const atlas=buildUVSeamAtlas(g);
 assert.equal(atlas.stats.directionalLinks,0);
 atlas.dispose();
});
test('GPU seam data is packed in three-or-fewer links per triangle',()=>{
 const atlas=buildUVSeamAtlas(square());
 assert.equal(atlas.stride,13);
 assert.ok(atlas.texture.image.data.length>=2*atlas.stride*4);
 for(const link of atlas.links){
   assert.ok(Number.isFinite(link.targetUVAltitude)&&link.targetUVAltitude>0);
   assert.ok(link.targetWorldAltitude>0);
 }
 atlas.dispose();
});
