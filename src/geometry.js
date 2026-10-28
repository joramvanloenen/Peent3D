import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addTopologyEdgeData} from './edge.js';
import {bakeSignedMeanCurvature} from './curvature.js';

// All baking geometry is non-indexed: one unambiguous UV, normal and ID per triangle corner.
export function createDemoMesh() {
  const geometry=new THREE.BoxGeometry(1,1,1).toNonIndexed();
  const uv=geometry.getAttribute('uv');
  for(let face=0;face<6;face++){
    for(let i=face*6;i<face*6+6;i++){
      const x=face%3,y=Math.floor(face/3);
      uv.setXY(i,(x+.06+uv.getX(i)*.88)/3,(y+.06+uv.getY(i)*.88)/2);
    }
  }
  uv.needsUpdate=true;
  return prepareScene(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),'Default cube');
}

export async function loadMesh(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let root;
  if (ext === 'obj') root = new OBJLoader().parse(await file.text());
  else if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const bytes = await file.arrayBuffer();
    const gltf = await new Promise((resolve, reject) => loader.parse(bytes, '', resolve, reject));
    root = gltf.scene;
  } else throw Error('Supported mesh formats are .obj, .glb and embedded .gltf');
  return prepareScene(root, file.name);
}

// Low-cost warning for stacked/overlapping UV islands. A geometry map cannot
// encode different surface normals/positions into the very same UV texel.
export function estimateUVOverlap(geometry, gridSize=96, maxTriangles=20000) {
  const uv=geometry.getAttribute('uv');
  if(!uv)return 1;
  const tris=Math.floor(uv.count/3);
  if(!tris)return 0;
  const visited=new Int32Array(gridSize*gridSize);visited.fill(-1);
  let overlap=0,total=0;
  const step=Math.max(1,Math.ceil(tris/maxTriangles));
  for(let t=0;t<tris;t+=step){
    const ax=uv.getX(t*3),ay=uv.getY(t*3);
    const bx=uv.getX(t*3+1),by=uv.getY(t*3+1);
    const cx=uv.getX(t*3+2),cy=uv.getY(t*3+2);
    const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(det)<1e-12)continue;
    const minX=Math.max(0,Math.ceil(Math.min(ax,bx,cx)*gridSize-.5));
    const maxX=Math.min(gridSize-1,Math.floor(Math.max(ax,bx,cx)*gridSize-.5));
    const minY=Math.max(0,Math.ceil(Math.min(ay,by,cy)*gridSize-.5));
    const maxY=Math.min(gridSize-1,Math.floor(Math.max(ay,by,cy)*gridSize-.5));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const px=(x+.5)/gridSize,py=(y+.5)/gridSize;
      const b0=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/det;
      const b1=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/det;
      const b2=1-b0-b1;
      if(b0<=.015||b1<=.015||b2<=.015)continue;
      const index=y*gridSize+x;
      total++;
      if(visited[index]>=0 && visited[index]!==t)overlap++;
      else visited[index]=t;
    }
  }
  return total?Math.min(1,overlap/total):0;
}

export function prepareScene(root, name = 'Untitled') {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(child => {
    if (child.isMesh && child.geometry?.getAttribute('position')) meshes.push(child);
  });
  if (!meshes.length) throw Error('The file does not contain any triangle meshes.');
  const positions = [], normals = [], uvs = [], ids = [], meshIDs = [];
  let meshId = 0, missingUVs = false, triangleCount = 0;
  for (const mesh of meshes) {
    let geometry = mesh.geometry.clone();
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const triangles = Math.floor(p.count / 3);
    if (!uv) missingUVs = true;
    const cols = Math.ceil(Math.sqrt(triangles));
    const materialGroups = geometry.groups || [];
    for (let t = 0; t < triangles; t++) {
      const group = materialGroups.find(g => t * 3 >= g.start && t * 3 < g.start + g.count);
      const materialId = meshId * 16 + (group?.materialIndex || 0);
      for (let corner = 0; corner < 3; corner++) {
        const i = t * 3 + corner;
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        if (uv) uvs.push(uv.getX(i), uv.getY(i));
        else {
          // Triangle-atlas fallback keeps UVs unique. Supply authored UVs for high quality.
          const cx = t % cols, cy = Math.floor(t / cols);
          const tx = [0.08, 0.92, 0.08][corner];
          const ty = [0.08, 0.08, 0.92][corner];
          uvs.push((cx + tx) / cols, (cy + ty) / cols);
        }
        ids.push(materialId);meshIDs.push(meshId);
      }
    }
    triangleCount += triangles;
    meshId++;
    geometry.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Per-triangle UV centroid lets the baker expand raster coverage ~0.7 texel,
  // capturing subpixel-thin corners without moving any actual geometry or
  // changing the UVs of the visible model.
  const centroids=new Float32Array(uvs.length);
  for(let i=0;i<uvs.length;i+=6){
    const x=(uvs[i]+uvs[i+2]+uvs[i+4])/3;
    const y=(uvs[i+1]+uvs[i+3]+uvs[i+5])/3;
    for(let k=0;k<3;k++){centroids[i+k*2]=x;centroids[i+k*2+1]=y;}
  }
  g.setAttribute('aUvCentroid',new THREE.BufferAttribute(centroids,2));
  g.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1));
  g.setAttribute('aMeshId',new THREE.Float32BufferAttribute(meshIDs,1));
  g.computeBoundingBox();
  const bounds = g.boundingBox.clone();
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  if (radius < 1e-8) throw Error('Mesh has zero size.');
  // Uniform normalization maintains proportions and keeps ray distances predictable.
  const attr = g.getAttribute('position');
  for (let i = 0; i < attr.count; i++) {
    attr.setXYZ(i, (attr.getX(i)-center.x)*2.5/radius, (attr.getY(i)-center.y)*2.5/radius, (attr.getZ(i)-center.z)*2.5/radius);
  }
  attr.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  computeCurvature(g);
  const signedCurvatureStats=bakeSignedMeanCurvature(g);
  const edgeStats=addTopologyEdgeData(g);
  const uvOverlap=missingUVs?0:estimateUVOverlap(g);
  return {geometry:g, triangleCount, name, missingUVs, meshCount:meshes.length,edgeStats,uvOverlap,signedCurvatureStats:{uniqueVertices:signedCurvatureStats.uniqueVertices,normalization:signedCurvatureStats.normalization}};
}

function computeCurvature(g) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const verts = new Map(), keys = [];
  const key = i => [p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*10000)).join(',');
  for (let i=0;i<p.count;i++) {
    const k=key(i); keys.push(k);
    if(!verts.has(k)) verts.set(k,{p:new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)), n:new THREE.Vector3(), neighbors:new Set(), curvature:0});
    verts.get(k).n.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));
  }
  for(let i=0;i<p.count;i+=3) for(let c=0;c<3;c++) {
    const a=verts.get(keys[i+c]); a.neighbors.add(keys[i+(c+1)%3]); a.neighbors.add(keys[i+(c+2)%3]);
  }
  for(const v of verts.values()) v.n.normalize();
  const d=new THREE.Vector3();
  for(const v of verts.values()) {
    let k=0, count=0;
    for(const neighborKey of v.neighbors) {
      const other=verts.get(neighborKey);
      d.subVectors(other.p,v.p);
      const len=d.lengthSq();
      if(len<1e-10) continue;
      // Convex sphere: neighboring points lie behind the tangent plane (negative dot).
      k+=-d.dot(v.n)/len;
      count++;
    }
    v.curvature=count ? Math.tanh((k/count)*0.30) : 0;
  }
  const values=new Float32Array(p.count);
  for(let i=0;i<values.length;i++) values[i]=Math.max(0,Math.min(1,.5+verts.get(keys[i]).curvature));
  g.setAttribute('aCurvature',new THREE.BufferAttribute(values,1));
}

export function buildBVH(geometry) {
  const pos=geometry.getAttribute('position');
  const tris=[];
  for(let t=0;t<pos.count/3;t++) {
    const v=[];
    for(let j=0;j<3;j++) v.push(new THREE.Vector3().fromBufferAttribute(pos,t*3+j));
    const center=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);
    tris.push({v,center});
  }
  const nodes=[], ordered=[];
  function build(list, depth) {
    const id=nodes.length;
    const min=new THREE.Vector3(Infinity,Infinity,Infinity);
    const max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    for(const t of list) for(const p of t.v){min.min(p);max.max(p);}
    const node={min,max,left:-1,right:-1,start:-1,count:0};
    nodes.push(node);
    if(list.length<=4 || depth>=32){
      node.start=ordered.length;node.count=list.length;ordered.push(...list);
    } else {
      const extent=max.clone().sub(min);
      const axis=extent.x>extent.y ? (extent.x>extent.z?'x':'z') : (extent.y>extent.z?'y':'z');
      list.sort((a,b)=>a.center[axis]-b.center[axis]);
      const m=Math.floor(list.length/2);
      node.left=build(list.slice(0,m),depth+1);
      node.right=build(list.slice(m),depth+1);
    }
    return id;
  }
  build(tris,0);
  function textureFromTexels(values) {
    const texels=values.length/4, width=Math.min(1024,Math.max(1,Math.ceil(Math.sqrt(texels))));
    const height=Math.ceil(texels/width);
    const data=new Float32Array(width*height*4);data.set(values);
    const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;texture.needsUpdate=true;
    return {texture,width,height};
  }
  const nodeData=[];
  for(const n of nodes){
    nodeData.push(n.min.x,n.min.y,n.min.z,n.left);
    nodeData.push(n.max.x,n.max.y,n.max.z,n.right);
    nodeData.push(n.start,n.count,0,0);
  }
  const triangleData=[];
  for(const t of ordered) for(const v of t.v) triangleData.push(v.x,v.y,v.z,0);
  return {nodes:textureFromTexels(nodeData),triangles:textureFromTexels(triangleData),nodeCount:nodes.length,triangleCount:ordered.length,dispose(){
    this.nodes.texture.dispose();this.triangles.texture.dispose();
  }};
}
