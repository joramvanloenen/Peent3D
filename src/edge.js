import * as THREE from 'three';

const EPS = 1e-9;
function coordinateKey(position, index) {
  return [
    position.getX(index), position.getY(index), position.getZ(index)
  ].map(x=>Math.round(x*100000)).join(',');
}
export function classifyEdge(faceNormal, otherPoint, edgePoint, adjacentNormal) {
  const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(faceNormal.dot(adjacentNormal),-1,1)));
  if(angle<0.5)return 0;
  const orientation=faceNormal.dot(otherPoint.clone().sub(edgePoint));
  if(Math.abs(orientation)<EPS)return 0;
  return orientation<0 ? angle : -angle; // convex positive, concave negative for consistent outward winding
}
/**
 * Build physically scaled edge metrics from polygon adjacency (not smoothed vertex normals).
 *
 * aEdgeAngles: three signed dihedral angles in DEGREES, each opposite one corner.
 * aEdgeAltitude: triangle world-space altitudes for the corresponding opposite edge.
 * aBarycentric: per-corner barycentric coordinates interpolated during UV rasterization.
 * UV seams are ignored in adjacency lookup: only 3D positions identify shared edges.
 */
export function addTopologyEdgeData(geometry) {
  const position=geometry.getAttribute('position');
  if(!position || position.count%3)throw Error('Nonindexed triangle geometry required');
  const count=position.count/3;
  const faces=[];
  const edges=new Map();
  const p=(i)=>new THREE.Vector3().fromBufferAttribute(position,i);
  const key=Array.from({length:position.count},(_,i)=>coordinateKey(position,i));
  const opposite=[[1,2],[2,0],[0,1]];
  for(let t=0;t<count;t++){
    const verts=[p(t*3),p(t*3+1),p(t*3+2)];
    const cross=verts[1].clone().sub(verts[0]).cross(verts[2].clone().sub(verts[0]));
    const twiceArea=cross.length();
    const normal=twiceArea>EPS?cross.clone().divideScalar(twiceArea):new THREE.Vector3(0,1,0);
    const face={verts,normal,altitude:[0,0,0],angles:[0,0,0]};
    faces.push(face);
    for(let e=0;e<3;e++){
      const [a,b]=opposite[e];
      const length=verts[a].distanceTo(verts[b]);
      face.altitude[e]=length>EPS?twiceArea/length:0;
      const ka=key[t*3+a],kb=key[t*3+b];
      const edgeKey=ka<kb?ka+'|'+kb:kb+'|'+ka;
      if(!edges.has(edgeKey))edges.set(edgeKey,[]);
      edges.get(edgeKey).push({triangle:t,opposite:e,third:verts[e]});
    }
  }
  for(const shared of edges.values()){
    if(shared.length<2)continue; // do not mistake open mesh boundaries for convex edges
    for(const entry of shared){
      const face=faces[entry.triangle];
      const edgePoint=face.verts[opposite[entry.opposite][0]];
      let score=0;
      for(const other of shared){
        if(other===entry || other.triangle===entry.triangle)continue;
        const value=classifyEdge(face.normal,other.third,edgePoint,faces[other.triangle].normal);
        if(Math.abs(value)>Math.abs(score))score=value;
      }
      face.angles[entry.opposite]=score;
    }
  }
  const angleValues=new Float32Array(position.count*3);
  const altitudeValues=new Float32Array(position.count*3);
  const bary=new Float32Array(position.count*3);
  let convex=0,concave=0;
  for(let t=0;t<count;t++){
    const face=faces[t];
    for(let c=0;c<3;c++){
      const i=t*3+c;
      angleValues.set(face.angles,i*3);
      altitudeValues.set(face.altitude,i*3);
      bary.set([+(c===0),+(c===1),+(c===2)],i*3);
    }
    convex+=face.angles.filter(x=>x>0.5).length;
    concave+=face.angles.filter(x=>x<-.5).length;
  }
  geometry.setAttribute('aEdgeAngles',new THREE.BufferAttribute(angleValues,3));
  geometry.setAttribute('aEdgeAltitude',new THREE.BufferAttribute(altitudeValues,3));
  geometry.setAttribute('aBarycentric',new THREE.BufferAttribute(bary,3));
  return {convex:Math.round(convex/2),concave:Math.round(concave/2),uniqueEdges:edges.size};
}

/**
 * Surface-aware spatial feature-edge atlas.
 * A UV seam is never added as a feature: edges are welded by 3D coordinates
 * within each mesh, and only signed non-coplanar dihedrals become candidates.
 * Each triangle receives nearby actual 3D segments; the GPU computes exact
 * point-to-finite-segment distance at the texel's 3D surface position.
 */
export const EDGE_CANDIDATES = 24;
export function buildEdgeNeighborhood(geometry,{maxDistance=.32,candidates=EDGE_CANDIDATES}={}){
  const pos=geometry.getAttribute('position');
  const mesh=geometry.getAttribute('aMeshId');
  const keys=Array.from({length:pos.count},(_,i)=>(mesh?mesh.getX(i)+'|':'')+coordinateKey(pos,i));
  const edgeMap=new Map(), triCount=pos.count/3, triBounds=[];
  const opposite=[[1,2],[2,0],[0,1]];
  for(let t=0;t<triCount;t++){
    const pts=[0,1,2].map(c=>new THREE.Vector3().fromBufferAttribute(pos,t*3+c));
    const n=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
    const box=new THREE.Box3().setFromPoints(pts);
    triBounds.push(box);
    for(let k=0;k<3;k++){
      const [a,b]=opposite[k],aKey=keys[t*3+a],bKey=keys[t*3+b];
      const id=aKey<bKey?aKey+'~'+bKey:bKey+'~'+aKey;
      if(!edgeMap.has(id))edgeMap.set(id,[]);
      edgeMap.get(id).push({t,n,opposite:pts[k],a:pts[a],b:pts[b]});
    }
  }
  const segments=[];
  for(const shared of edgeMap.values()){
    if(shared.length!==2)continue; // open boundaries and non-manifold welds excluded
    const [a,b]=shared;
    const signed=classifyEdge(a.n,b.opposite,a.a,b.n);
    if(Math.abs(signed)<.5)continue;
    const box=new THREE.Box3().setFromPoints([a.a,a.b]);
    segments.push({a:a.a,b:a.b,angle:signed,box,triangles:[a.t,b.t]});
  }
  const bounds=geometry.boundingBox||new THREE.Box3().setFromBufferAttribute(pos);
  const cell=Math.max(.14,maxDistance*1.4);
  const cells=new Map();
  const cellPoint=(p)=>[Math.floor((p.x-bounds.min.x)/cell),Math.floor((p.y-bounds.min.y)/cell),Math.floor((p.z-bounds.min.z)/cell)];
  const token=(x,y,z)=>x+','+y+','+z;
  for(let i=0;i<segments.length;i++){
    const box=segments[i].box.clone().expandByScalar(maxDistance);
    const a=cellPoint(box.min),b=cellPoint(box.max);
    for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++)for(let z=a[2];z<=b[2];z++){
      const k=token(x,y,z);
      if(!cells.has(k))cells.set(k,[]);
      cells.get(k).push(i);
    }
  }
  const stride=1+candidates*2;
  const texels=triCount*stride, width=Math.min(1024,Math.max(1,Math.ceil(Math.sqrt(texels))));
  const height=Math.ceil(texels/width);
  const packed=new Float32Array(width*height*4);
  let overflow=0,maxFound=0;
  const gap=(a,b)=>Math.hypot(
    Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),
    Math.max(0,a.min.y-b.max.y,b.min.y-a.max.y),
    Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z)
  );
  for(let t=0;t<triCount;t++){
    const box=triBounds[t],a=cellPoint(box.min),b=cellPoint(box.max);
    const nearby=new Set();
    for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++)for(let z=a[2];z<=b[2];z++){
      for(const index of cells.get(token(x,y,z))||[])nearby.add(index);
    }
    // Segment-AABB is a conservative lower bound. Always prioritize the
    // source triangle's own feature edges to avoid losing short edge details.
    const sorted=[...nearby].map(index=>{
      const seg=segments[index],distance=gap(box,seg.box);
      return {index,distance,own:seg.triangles.includes(t)};
    }).filter(x=>x.own||x.distance<=maxDistance+1e-4)
      .sort((a,b)=>(Number(b.own)-Number(a.own))||a.distance-b.distance);
    if(sorted.length>candidates)overflow++;
    maxFound=Math.max(maxFound,sorted.length);
    const count=Math.min(candidates,sorted.length),start=t*stride;
    packed[start*4]=count;
    for(let j=0;j<count;j++){
      const segment=segments[sorted[j].index],base=(start+1+j*2)*4;
      packed.set([segment.a.x,segment.a.y,segment.a.z,segment.angle],base);
      packed.set([segment.b.x,segment.b.y,segment.b.z,0],base+4);
    }
  }
  const texture=new THREE.DataTexture(packed,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,width,height,stride,segments,overflow,maxFound,
    dispose(){this.texture.dispose();}};
}
export function segmentDistance3D(point,a,b){
  const e=b.clone().sub(a);
  const t=THREE.MathUtils.clamp(point.clone().sub(a).dot(e)/Math.max(1e-12,e.lengthSq()),0,1);
  return point.distanceTo(a.clone().addScaledVector(e,t));
}
export function nearestFeatureDistance(point,segments,minAngle=0,sign=1){
  let distance=Infinity;
  for(const segment of segments){
    if(segment.angle*sign<minAngle)continue;
    distance=Math.min(distance,segmentDistance3D(point,segment.a,segment.b));
  }
  return distance;
}
