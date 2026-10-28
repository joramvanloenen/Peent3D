import * as THREE from 'three';

/**
 * Cotangent-weighted discrete signed mean curvature.
 *
 * Δx_i = sum_j(1/2(cot α + cot β))(x_j-x_i) / A_i
 * H_i  = -1/2 <Δx_i,n_i>. Outward convex > 0, concave < 0.
 *
 * Topology is welded by 3D position WITHIN each submesh, not by UV or split
 * rendering normals. UV vertices remain unchanged for texture rasterization.
 * Returns three normalized curvature scales in RGB [0,1], neutral = 0.5.
 * This is intentionally separate from legacy aCurvature and edge-distance data.
 */
export function bakeSignedMeanCurvature(geometry,{weldPrecision=1e5,iterations=[0,2,6]}={}){
  const p=geometry.getAttribute('position');
  const mesh=geometry.getAttribute('aMeshId');
  if(!p||p.count%3!==0)throw new Error('Signed curvature needs nonindexed triangle geometry.');
  const count=p.count,cornerIDs=new Int32Array(count);
  const lookup=new Map(),positions=[],normals=[],areas=[],adjacency=[];
  const key=i=>{
    const id=mesh?mesh.getX(i):0;
    return id+'|'+[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*weldPrecision)).join(',');
  };
  for(let i=0;i<count;i++){
    const k=key(i);
    let id=lookup.get(k);
    if(id===undefined){
      id=positions.length;lookup.set(k,id);
      positions.push(new THREE.Vector3().fromBufferAttribute(p,i));
      normals.push(new THREE.Vector3());
      areas.push(0);
      adjacency.push(new Map());
    }
    cornerIDs[i]=id;
  }
  const edgeFaces=new Map();
  const weight=(a,b,cot)=>{
    if(a===b)return;
    const w=Math.max(-1000,Math.min(1000,cot*.5));
    adjacency[a].set(b,(adjacency[a].get(b)||0)+w);
    adjacency[b].set(a,(adjacency[b].get(a)||0)+w);
  };
  const epsilon=1e-11;
  for(let k=0;k<count;k+=3){
    const ids=[cornerIDs[k],cornerIDs[k+1],cornerIDs[k+2]];
    if(new Set(ids).size!==3)continue;
    const [a,b,c]=ids.map(i=>positions[i]);
    const ab=b.clone().sub(a),ac=c.clone().sub(a),bc=c.clone().sub(b);
    const cross=ab.clone().cross(ac),doubleArea=cross.length();
    if(doubleArea<epsilon)continue;
    const normal=cross.clone().divideScalar(doubleArea);
    const area=doubleArea*.5;
    for(const i of ids){areas[i]+=area/3;normals[i].add(cross);}
    // Each triangle's cotangent at one vertex weights the opposite edge.
    const cotA=ab.dot(ac)/doubleArea;
    const cotB=ab.clone().negate().dot(bc)/doubleArea;
    const cotC=ac.dot(bc)/doubleArea;
    weight(ids[1],ids[2],cotA);
    weight(ids[2],ids[0],cotB);
    weight(ids[0],ids[1],cotC);
    for(const [i,j] of [[0,1],[1,2],[2,0]]){
      const x=Math.min(ids[i],ids[j]),y=Math.max(ids[i],ids[j]),token=x+','+y;
      if(!edgeFaces.has(token))edgeFaces.set(token,[]);
      edgeFaces.get(token).push(normal);
    }
  }
  normals.forEach(n=>n.normalize());
  const raw=new Float64Array(positions.length);
  for(let i=0;i<positions.length;i++){
    if(areas[i]<epsilon||normals[i].lengthSq()<.5)continue;
    const lap=new THREE.Vector3();
    for(const [j,w] of adjacency[i]){
      if(!Number.isFinite(w))continue;
      lap.addScaledVector(positions[j].clone().sub(positions[i]),w);
    }
    lap.divideScalar(Math.max(areas[i],epsilon));
    const curvature=-.5*lap.dot(normals[i]);
    raw[i]=Number.isFinite(curvature)?curvature:0;
  }
  const ordered=Array.from(raw,Math.abs).filter(Number.isFinite).sort((a,b)=>a-b);
  const q95=ordered.length?ordered[Math.floor((ordered.length-1)*.95)]:0;
  const normalization=Math.max(q95,1e-8);
  // Edge-aware iterative smoothing: damp diffusion across sharp geometric
  // features, preventing unrelated faces from bleeding across a hard crease.
  const smoothingWeights=adjacency.map(()=>new Map());
  for(const [key,faces] of edgeFaces){
    const [a,b]=key.split(',').map(Number);
    let crease=0;
    if(faces.length===2){
      crease=Math.acos(THREE.MathUtils.clamp(faces[0].dot(faces[1]),-1,1));
    }else if(faces.length!==2)crease=Math.PI/2;
    const influence=Math.exp(-Math.pow(crease/(Math.PI/4),2)*2.5);
    const length=positions[a].distanceTo(positions[b]);
    if(length<epsilon)continue;
    const w=influence/length;
    smoothingWeights[a].set(b,w);
    smoothingWeights[b].set(a,w);
  }
  const maxIteration=Math.max(...iterations);
  const scales=new Map([[0,raw]]);
  let current=raw;
  for(let step=1;step<=maxIteration;step++){
    const next=new Float64Array(current.length);
    for(let i=0;i<next.length;i++){
      let weighted=0,total=0;
      for(const [j,w] of smoothingWeights[i]){
        weighted+=w*current[j];total+=w;
      }
      next[i]=total>0?.5*current[i]+.5*weighted/total:current[i];
    }
    current=next;
    if(iterations.includes(step))scales.set(step,current);
  }
  const encode=x=>.5+.5*Math.tanh(x/normalization);
  const result=new Float32Array(count*3);
  for(let c=0;c<count;c++){
    const id=cornerIDs[c];
    for(let k=0;k<3;k++){
      result[c*3+k]=encode((scales.get(iterations[k])||raw)[id]);
    }
  }
  geometry.setAttribute('aSignedMeanCurvature',new THREE.BufferAttribute(result,3));
  return {uniqueVertices:positions.length,normalization,raw,cornerIDs};
}
