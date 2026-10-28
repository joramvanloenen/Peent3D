import * as THREE from 'three';

// Geometry-seeded surface runoff. "Particles" start ONLY at exposed upper
// edges / overhanging ledges, then follow projected gravity across welded
// adjacent triangles. They never spontaneously spawn in the middle of a face.
// This is a deterministic quasi-static surface-film approximation, not a
// Navier-Stokes fluid solver.
export const RUNOFF_CANDIDATES=16;
const G=new THREE.Vector3(0,-1,0), EPS=1e-7;
const posKey=(p,mesh)=>mesh+'|'+[p.x,p.y,p.z].map(v=>Math.round(v*100000)).join(',');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function noise1(x){let k=Math.imul(x|0,0x27d4eb2d)^0x9e3779b9;k=Math.imul(k^(k>>>15),0x85ebca6b);return ((k^(k>>>13))>>>0)/4294967295;}
const triEdge=[[0,1],[1,2],[2,0]];

// Exact ray-vs-triangle-edge crossing IN the triangle plane.
// A particle moves continuously across triangles and UV seams.
function firstExit(face,p,d,ignore=-1){
  let best=null;
  for(let k=0;k<3;k++){
    if(k===ignore)continue;
    const [i,j]=triEdge[k],a=face.v[i],b=face.v[j],e=b.clone().sub(a);
    const den=d.clone().cross(e).dot(face.n);
    if(Math.abs(den)<EPS)continue;
    const ap=a.clone().sub(p);
    const t=ap.clone().cross(e).dot(face.n)/den;
    const u=ap.clone().cross(d).dot(face.n)/den;
    if(t>1e-5&&u>=-1e-4&&u<=1.0001&&(!best||t<best.t))best={t,edge:k};
  }
  return best;
}
function flowDirection(face,drift=0){
  const tangent=G.clone().addScaledVector(face.n,-G.dot(face.n));
  const fall=tangent.length();
  if(fall<.25)return null;
  tangent.divideScalar(fall);
  // Weak surface-adhesion/capillary drift, always net-downhill.
  if(drift){
    const lateral=new THREE.Vector3().crossVectors(face.n,tangent).normalize();
    tangent.addScaledVector(lateral,drift*.10).normalize();
  }
  return tangent;
}

export function buildRunoffAtlas(geometry,{
  maxParticles=1800,maxTraceSteps=70,maxTraceDistance=3.6,candidates=RUNOFF_CANDIDATES
}={}){
  const p=geometry.getAttribute('position'),id=geometry.getAttribute('aMeshId');
  if(!p||p.count%3)throw Error('Runoff requires nonindexed triangles');
  const triangleCount=p.count/3;
  const faces=[],edges=new Map();
  for(let t=0;t<triangleCount;t++){
    const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,t*3+k));
    const n=new THREE.Vector3().subVectors(v[1],v[0]).cross(new THREE.Vector3().subVectors(v[2],v[0]));
    if(n.lengthSq()<1e-12){faces.push({v,n:new THREE.Vector3(0,1,0),adj:[null,null,null],mesh:-1});continue;}
    n.normalize();
    const mesh=id?id.getX(t*3):0;
    const face={v,n,mesh,adj:[null,null,null],segs:[]};
    faces.push(face);
    for(let k=0;k<3;k++){
      const [a,b]=triEdge[k],ka=posKey(v[a],mesh),kb=posKey(v[b],mesh);
      const key=ka<kb?ka+'~'+kb:kb+'~'+ka;
      if(!edges.has(key))edges.set(key,[]);
      edges.get(key).push({tri:t,edge:k,a:v[a],b:v[b]});
    }
  }
  const sources=[];
  for(const shared of edges.values()){
    if(shared.length===2){
      const [a,b]=shared;
      faces[a.tri].adj[a.edge]={tri:b.tri,edge:b.edge};
      faces[b.tri].adj[b.edge]={tri:a.tri,edge:a.edge};
    }
    if(shared.length>2)continue; // ambiguous non-manifold sheet
    for(const e of shared){
      const face=faces[e.tri],other=shared.find(x=>x!==e);
      if(face.mesh<0||!flowDirection(face))continue;
      const diff=e.b.clone().sub(e.a),edgeLength=diff.length();
      if(edgeLength<.014)continue;
      const horizontal=Math.hypot(diff.x,diff.z);
      // Gravity-ledges run horizontally. Vertical mesh seams are not sources.
      if(horizontal<.01||Math.abs(diff.y)>horizontal*.38)continue;
      const third=face.v[3-triEdge[e.edge][0]-triEdge[e.edge][1]];
      const edgeY=(e.a.y+e.b.y)*.5;
      if(third.y>edgeY-.008)continue; // source must OVERHANG the face below
      let sourceAngle=90;
      if(other){
        const neighbor=faces[other.tri],dot=clamp(face.n.dot(neighbor.n),-1,1);
        const angle=THREE.MathUtils.radToDeg(Math.acos(dot));
        // Require actual top/ledge discontinuity, never coplanar triangles.
        if(angle<16||neighbor.n.y<.16)continue;
        sourceAngle=angle;
      }
      sources.push({...e,length:edgeLength,angle:sourceAngle,neighbor:other?.tri??-1});
    }
  }
  sources.sort((a,b)=>a.tri-b.tri||a.edge-b.edge);
  const stats={sources:sources.length,particles:0,segments:0,overflowTriangles:0};
  const entries=faces.map(()=>[]);
  // Quasi-uniform emitters distribute along source edges. Density controls
  // selection in the shader; it never creates a new spawn position on a wall.
  let particleID=0;
  for(let sourceIdx=0;sourceIdx<sources.length;sourceIdx++){
    const s=sources[sourceIdx];
    const count=clamp(Math.ceil(s.length/.18),1,22);
    for(let k=0;k<count;k++){
      if(stats.particles>=maxParticles)break;
      const variation=noise1(sourceIdx*137+k*197+31);
      const fraction=clamp((k+.18+.65*variation)/count,.015,.985);
      const point=s.a.clone().lerp(s.b,fraction);
      const rand=noise1(sourceIdx*509+k*313+79);
      const seed=particleID++;
      let current=s.tri,pnt=point.clone(),arc=0,entered=-1;
      const segments=[];
      for(let step=0;step<maxTraceSteps&&arc<maxTraceDistance;step++){
        const face=faces[current];
        const drift=(noise1(seed*17+step*7+4)-.5)*2;
        const dir=flowDirection(face,drift);
        if(!dir)break;
        // Project onto the new triangle after crossing an edge. Only the
        // transport direction changes; position remains on the shared edge.
        const projected=pnt.clone().sub(face.v[0]).dot(face.n);
        pnt.addScaledVector(face.n,-projected);
        const exit=firstExit(face,pnt,dir,entered);
        if(!exit)break;
        const distance=Math.min(exit.t,maxTraceDistance-arc);
        if(distance<1e-5)break;
        const end=pnt.clone().addScaledVector(dir,distance);
        if(end.y>pnt.y+1e-5)break; // no uphill paths
        segments.push({tri:current,a:pnt.clone(),b:end.clone(),
          arc,seed,rand,angle:s.angle});
        arc+=distance;
        if(distance+1e-5<exit.t)break;
        const next=face.adj[exit.edge];
        if(!next||faces[next.tri].mesh!==face.mesh)break;
        // Transport across the shared mesh edge without resetting the stream.
        if(next.tri===current)break;
        pnt=end;
        current=next.tri;
        entered=next.edge;
      }
      if(!segments.length)continue;
      const total=arc;
      for(const seg of segments){
        seg.total=total;
        entries[seg.tri].push(seg);
      }
      stats.particles++;
      stats.segments+=segments.length;
    }
    if(stats.particles>=maxParticles)break;
  }
  const stride=1+candidates*3;
  const texels=triangleCount*stride;
  const width=Math.min(2048,Math.max(1,Math.ceil(Math.sqrt(texels))));
  const height=Math.ceil(texels/width);
  const data=new Float32Array(width*height*4);
  for(let t=0;t<triangleCount;t++){
    const paths=entries[t];
    // Prefer longer visible trails and deterministic sparse source selection
    // when dense mesh geometry exceeds the per-texel candidate budget.
    paths.sort((a,b)=>b.total-a.total||a.seed-b.seed);
    const count=Math.min(candidates,paths.length);
    if(paths.length>candidates)stats.overflowTriangles++;
    const off=t*stride;
    data[off*4]=count;
    for(let j=0;j<count;j++){
      const seg=paths[j],ix=(off+1+j*3)*4;
      data.set([seg.a.x,seg.a.y,seg.a.z,seg.arc],ix);
      data.set([seg.b.x,seg.b.y,seg.b.z,seg.seed],ix+4);
      data.set([seg.rand,seg.total,seg.angle,0],ix+8);
    }
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,width,height,stride,stats,sources,
    dispose(){this.texture.dispose();}};
}
