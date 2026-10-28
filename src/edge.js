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
