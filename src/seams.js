import * as THREE from 'three';

// A geometric UV seam is two triangle sides that share the same 3D edge on
// the SAME mesh, but differ in UV coordinates. A hard normal / UV island split
// is therefore stitched; a coplanar triangulation edge with identical UVs is
// not. Physically close disconnected objects are never stitched.
const PAIR_TOLERANCE=1e-5;
const key=(p,mesh)=>mesh+'|'+[p.x,p.y,p.z].map(v=>Math.round(v*100000)).join(',');
const read=(attr,i,dimension=3)=>dimension===3
  ?new THREE.Vector3().fromBufferAttribute(attr,i)
  :new THREE.Vector2().fromBufferAttribute(attr,i);
const EDGE_CORNERS=[[0,1,2],[1,2,0],[2,0,1]];
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function mapAcrossUVSeam(seam,point,worldDistance=0,minInset=0){
 const edge=seam.worldB.clone().sub(seam.worldA);
 const t=clamp(point.clone().sub(seam.worldA).dot(edge)/Math.max(1e-15,edge.lengthSq()),0,1);
 const uv=seam.targetA.clone().lerp(seam.targetB,t);
 const inset=Math.min(seam.targetUVAltitude*.28,
   Math.max(worldDistance/Math.max(seam.targetWorldAltitude,1e-8)*seam.targetUVAltitude,minInset));
 return uv.addScaledVector(seam.targetInward,inset);
}
export function buildUVSeamAtlas(geometry,{weldPrecision=1e5}={}){
 const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
 const mesh=geometry.getAttribute('aMeshId');
 if(!p||!uv||p.count%3)throw Error('UV seam fix requires nonindexed triangle geometry and UVs.');
 const triangleCount=p.count/3,edgePairs=new Map(),faces=[];
 const edgeKey=(a,b,meshID)=>{
   const ka=key(a,meshID),kb=key(b,meshID);
   return ka<kb?ka+'~'+kb:kb+'~'+ka;
 };
 for(let t=0;t<triangleCount;t++){
   const vertices=[0,1,2].map(i=>read(p,t*3+i));
   const coords=[0,1,2].map(i=>read(uv,t*3+i,2));
   const a=vertices[1].clone().sub(vertices[0]),b=vertices[2].clone().sub(vertices[0]);
   const cross=a.clone().cross(b);
   const uvA=coords[1].clone().sub(coords[0]),uvB=coords[2].clone().sub(coords[0]);
   const uvArea=Math.abs(uvA.cross(uvB));
   const surfaceScale=Math.sqrt(Math.max(1e-12,cross.length())/Math.max(1e-12,uvArea));
   const face={vertices,coords,meshID:mesh?mesh.getX(t*3):0,
     surfaceScale,seams:[]};
   faces.push(face);
   for(let k=0;k<3;k++){
     const [a,b,opp]=EDGE_CORNERS[k],wa=vertices[a],wb=vertices[b];
     const edge=edgeKey(wa,wb,face.meshID);
     if(!edgePairs.has(edge))edgePairs.set(edge,[]);
     edgePairs.get(edge).push({t,k,wa,wb,ua:coords[a],ub:coords[b],other:coords[opp],
       oppWorld:vertices[opp],meshID:face.meshID});
   }
 }
 let seams=0,nonManifold=0,degenerate=0;
 const links=[];
 for(const pair of edgePairs.values()){
   if(pair.length!==2){if(pair.length>2)nonManifold++;continue;}
   const [a,b]=pair;
   if(a.meshID!==b.meshID)continue;
   const aligned=a.wa.distanceToSquared(b.wa)<1e-8;
   const targetA=aligned?b.ua:b.ub,targetB=aligned?b.ub:b.ua;
   const sameUV=a.ua.distanceToSquared(targetA)<PAIR_TOLERANCE**2
     &&a.ub.distanceToSquared(targetB)<PAIR_TOLERANCE**2;
   if(sameUV)continue;
   const push=(source,target)=>{
     const corresponding=source.wa.distanceToSquared(target.wa)<1e-8;
     const va=corresponding?target.ua:target.ub;
     const vb=corresponding?target.ub:target.ua;
     const edgeUV=vb.clone().sub(va);
     const perp=new THREE.Vector2(-edgeUV.y,edgeUV.x);
     if(perp.lengthSq()<1e-12){degenerate++;return;}
     perp.normalize();
     if(target.other.clone().sub(va).dot(perp)<0)perp.negate();
     const targetUVAltitude=target.other.clone().sub(va).dot(perp);
     const worldVector=target.wb.clone().sub(target.wa),offset=target.oppWorld.clone().sub(target.wa);
     const height=offset.clone().sub(worldVector.multiplyScalar(offset.dot(worldVector)/Math.max(worldVector.lengthSq(),1e-12))).length();
     if(height<1e-7||targetUVAltitude<1e-7){degenerate++;return;}
     const seam={
       worldA:source.wa,worldB:source.wb,targetA:va,targetB:vb,
       targetInward:perp,targetUVAltitude,targetWorldAltitude:height,
       sourceTriangle:source.t,targetTriangle:target.t
     };
     faces[source.t].seams.push(seam);
     links.push(seam);
   };
   push(a,b);push(b,a);
   seams++;
 }
 // One RGBA header and 4 texels per triangle boundary edge. A source
 // triangle has at most 3 physically connected UV seams.
 const stride=13;
 const texels=triangleCount*stride;
 const width=Math.min(2048,Math.max(1,Math.ceil(Math.sqrt(texels))));
 const height=Math.ceil(texels/width);
 const packed=new Float32Array(width*height*4);
 const vec=(offset,a,b,c,d)=>packed.set([a,b,c,d],offset*4);
 for(let t=0;t<triangleCount;t++){
   const face=faces[t],start=t*stride,count=Math.min(3,face.seams.length);
   vec(start,count,face.surfaceScale,0,0);
   for(let k=0;k<count;k++){
     const s=face.seams[k],base=start+1+k*4;
     vec(base,s.worldA.x,s.worldA.y,s.worldA.z,face.surfaceScale);
     vec(base+1,s.worldB.x,s.worldB.y,s.worldB.z,s.targetWorldAltitude);
     vec(base+2,s.targetA.x,s.targetA.y,s.targetB.x,s.targetB.y);
     vec(base+3,s.targetInward.x,s.targetInward.y,s.targetUVAltitude,0);
   }
 }
 const texture=new THREE.DataTexture(packed,width,height,THREE.RGBAFormat,THREE.FloatType);
 texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;
 texture.generateMipmaps=false;texture.needsUpdate=true;
 return {texture,width,height,stride,stats:{pairedEdges:seams,directionalLinks:links.length,
     nonManifold,degenerate,triangleCount},links,
   dispose(){this.texture.dispose();}};
}
