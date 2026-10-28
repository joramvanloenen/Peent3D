import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildBVH} from './geometry.js';
import {buildEdgeNeighborhood} from './edge.js';
import maskBlendFrag from './shaders/mask-blend.frag.glsl?raw';
import uvVert from './shaders/uv.vert.glsl?raw';
import uvFrag from './shaders/uv.frag.glsl?raw';
import quadVert from './shaders/quad.vert.glsl?raw';
import rayFrag from './shaders/ray.frag.glsl?raw';
import layerFrag from './shaders/layer.frag.glsl?raw';
import smartFrag from './shaders/smart.frag.glsl?raw';
import brushFrag from './shaders/brush.frag.glsl?raw';
import normalFrag from './shaders/normal.frag.glsl?raw';
import copyFrag from './shaders/copy.frag.glsl?raw';
import padFrag from './shaders/pad.frag.glsl?raw';

const CHANNELS=['baseColor','roughness','metalness','height'];
const MESH_MAPS=['position','worldNormal','curvature','id','elevation','normal','opacity','edges'];
export const MAP_NAMES=['baseColor','roughness','metalness','normal','height','position','worldNormal','curvature','id','elevation','opacity','ao','bentNormal','thickness'];

function target(size,type=THREE.HalfFloatType){
  const rt=new THREE.WebGLRenderTarget(size,size,{type,format:THREE.RGBAFormat,
    minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    generateMipmaps:false,depthBuffer:false,stencilBuffer:false});
  rt.texture.colorSpace=THREE.NoColorSpace;
  return rt;
}
function shader(vertex,fragment,uniforms){
  return new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
    side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:false,uniforms});
}
function U(value){return {value};}
function disposeTargets(collection){
  if(Array.isArray(collection)) collection.forEach(disposeTargets);
  else if(collection?.dispose) collection.dispose();
  else if(collection && typeof collection==='object') Object.values(collection).forEach(disposeTargets);
}

export class PeentGPU {
  constructor(element){
    this.element=element;
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    element.appendChild(this.renderer.domElement);
    this.renderer.setSize(element.clientWidth,element.clientHeight,false);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(45,1,.05,100);
    this.camera.position.set(2.8,2.2,3.7);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;
    this.controls.minDistance=.7;
    this.controls.maxDistance=22;
    this.controls.target.set(0,0,0);
    this.scene.add(new THREE.HemisphereLight(0xcad8ec,0x28313c,2.2));
    const key=new THREE.DirectionalLight(0xffedd9,3.0);key.position.set(3,6,4);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0x9bcade,1.3);fill.position.set(-5,2,-3);this.scene.add(fill);
    this.grid=new THREE.GridHelper(8,16,0x3b3b3b,0x303030);
    this.scene.add(this.grid);
    this.previewMaterial=new THREE.MeshStandardMaterial({color:0xffffff,metalness:0,roughness:.65,side:THREE.DoubleSide});
    this.uvScene=new THREE.Scene();
    this.quadScene=new THREE.Scene();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());
    this.quadScene.add(this.quad);
    this.quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.uvViewScene=new THREE.Scene();
    this.viewQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({toneMapped:false}));
    this.uvViewScene.add(this.viewQuad);
    this.viewCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.raycaster=new THREE.Raycaster();
    this.size=512;this.sampleCount=16;this.rayDistance=.35;
    this.maps={};this.composites=[];this.padded={};this.paintMasks=new Map();this.smartMasks=new Map();
    this.effectMasks=new Map();this.dirtyEffects=new Set();this.edgeMaps=new Map();this.imageTextures=new Map();
    this.whiteTexture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);this.whiteTexture.needsUpdate=true;
    this.dirtyFrom=0;
    this.dirtyChannels=new Set(CHANNELS);
    this.dirtySmart=new Set();
    this.interactive=false;
    this.view='3d';this.channel='material';this.layers=[];
    this.gpuName=this.renderer.getContext().getParameter(this.renderer.getContext().RENDERER)||'WebGL2';
    this._resizer=new ResizeObserver(()=>this.resize());
    this._resizer.observe(element);
    this._running=true;
    this._animate();
  }
  resize(){
    const w=Math.max(16,this.element.clientWidth),h=Math.max(16,this.element.clientHeight);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
    // Preserve a square UV image regardless of viewport aspect ratio.
    const ratio=w/h;
    this.viewQuad.scale.set(ratio>=1?1/ratio:1,ratio>=1?1:ratio,1);
  }
  _animate(){
    if(!this._running)return;
    requestAnimationFrame(()=>this._animate());
    this.controls.update();
    this.renderer.setRenderTarget(null);
    if(this.view==='uv'){
      const map=this.getPreviewTexture();
      this.viewQuad.material.map=map||null;
      this.renderer.render(this.uvViewScene,this.viewCamera);
    } else this.renderer.render(this.scene,this.camera);
  }
  setGeometry(result){
    if(this.mesh){this.scene.remove(this.mesh);this.mesh.geometry.dispose();}
    if(this.uvMesh)this.uvScene.remove(this.uvMesh);
    this.bvh?.dispose();
    this.features?.dispose();
    this.features=buildEdgeNeighborhood(result.geometry);
    const geometry=result.geometry;
    if(!geometry.getAttribute('aTriangleId')){
      const data=new Float32Array(geometry.getAttribute('position').count);
      for(let i=0;i<data.length;i++)data[i]=Math.floor(i/3);
      geometry.setAttribute('aTriangleId',new THREE.BufferAttribute(data,1));
    }
    this.uvBakeMaterial?.dispose();this.uvBakeMaterial=null;
    for(const rt of this.edgeMaps.values())rt.dispose();this.edgeMaps.clear();
    disposeTargets(this.maps);this.maps={};
    disposeTargets(this.composites);this.composites=[];
    disposeTargets(this.padded);this.padded={};
    for(const rt of this.smartMasks.values())rt.dispose();this.smartMasks.clear();
    for(const rt of this.effectMasks.values())rt.dispose();this.effectMasks.clear();this.dirtyEffects.clear();
    this.maskScratch?.dispose();this.maskScratch=null;
    this.normalResult?.dispose();this.normalResult=null;
    for(const rt of this.paintMasks.values())rt.dispose();
    this.paintMasks.clear();
    this.model=result;
    // Keep the reference grid BELOW the model instead of cutting through geometry.
    this.grid.position.y=result.geometry.boundingBox.min.y-.05;
    this.mesh=new THREE.Mesh(result.geometry,this.previewMaterial);
    this.mesh.frustumCulled=false;
    this.scene.add(this.mesh);
    this.uvMesh=new THREE.Mesh(result.geometry,null);
    this.uvMesh.frustumCulled=false;
    this.uvScene.add(this.uvMesh);
    this.bvh=buildBVH(result.geometry);
    this.dirtyFrom=0;this.dirtyChannels=new Set(CHANNELS);
    this.dirtySmart.clear();
    this.frame();
  }
  frame(){
    if(!this.model)return;
    const sphere=this.model.geometry.boundingSphere;
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(2.4,1.8,3.5).normalize().multiplyScalar(sphere.radius*3.25));
    this.camera.near=.01;this.camera.far=Math.max(100,sphere.radius*12);this.camera.updateProjectionMatrix();this.controls.update();
  }
  _draw(material,destination,geometryScene=null){
    this.renderer.setRenderTarget(destination);
    this.renderer.setClearColor(0x000000,0);
    // WebGLRenderer autoClear clears each render target once; avoid double clears.
    if(geometryScene){
      this.uvMesh.material=material;
      this.renderer.render(geometryScene,this.quadCamera);
    }else{
      this.quad.material=material;
      this.renderer.render(this.quadScene,this.quadCamera);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x11151c,1);
  }
  _edgeMap(angle=0,interactive=false){
    // Cache a separate exact-distance map for each actual dihedral threshold.
    // The edge-distance field itself is sampled in object space and is UV seam safe.
    const resolution=interactive?Math.min(this.size,512):this.size;
    const threshold=Math.round(Math.min(175,Math.max(0,angle)));
    const key=threshold+':'+resolution;
    if(this.edgeMaps.has(key))return this.edgeMaps.get(key);
    const rt=target(resolution);
    const mat=this.uvBakeMaterial;
    mat.uniforms.uMode.value=7;
    mat.uniforms.uAngleThreshold.value=threshold;
    this._draw(mat,rt,this.uvScene);
    rt.texture.magFilter=THREE.NearestFilter;
    this.edgeMaps.set(key,rt);
    // Bound persistent caches; a draggable angle control must not leak VRAM.
    if(this.edgeMaps.size>12){
      const first=this.edgeMaps.keys().next().value;
      if(first!==key){this.edgeMaps.get(first).dispose();this.edgeMaps.delete(first);}
    }
    return rt;
  }
  _bakeRaster(){
    const bounds=this.model.geometry.boundingBox;
    const size=bounds.getSize(new THREE.Vector3());
    this.uvBakeMaterial=shader(uvVert,uvFrag,{
      uMode:U(0),uMin:U(bounds.min.clone()),uSize:U(size),
      uFeatureSegments:U(this.features.texture),
      uFeatureWidth:U(this.features.width),
      uFeatureStride:U(this.features.stride),
      uAngleThreshold:U(0)
    });
    for(let i=0;i<MESH_MAPS.length-1;i++){
      const name=MESH_MAPS[i];
      this.maps[name]=target(this.size);
      this.uvBakeMaterial.uniforms.uMode.value=i;
      this._draw(this.uvBakeMaterial,this.maps[name],this.uvScene);
    }
    this.maps.edges=this._edgeMap(0,false);
  }
  _bakeRays(){
    const nodes=this.bvh.nodes,triangles=this.bvh.triangles;
    const mat=shader(quadVert,rayFrag,{
      uPosition:U(this.maps.position.texture),uNormal:U(this.maps.worldNormal.texture),
      uNodes:U(nodes.texture),uTriangles:U(triangles.texture),
      uNodesWidth:U(nodes.width),uTrianglesWidth:U(triangles.width),
      uSamples:U(this.sampleCount),uMode:U(0),uDistance:U(this.rayDistance)
    });
    // Ray maps are intentionally half-resolution; smooth sampling reconstructs masks.
    // AO is the most expensive stage, so this reduces ray counts approximately 4x.
    const raySize=Math.max(128,Math.floor(this.size/2));
    for(let i=0;i<3;i++){
      const name=['ao','bentNormal','thickness'][i];
      this.maps[name]=target(raySize);
      this.maps[name].texture.minFilter=THREE.LinearFilter;
      this.maps[name].texture.magFilter=THREE.LinearFilter;
      mat.uniforms.uMode.value=i;
      this._draw(mat,this.maps[name]);
    }
    mat.dispose();
  }
  async bake(onProgress=()=>{}){
    if(!this.model)throw Error('Load a mesh first');
    disposeTargets(this.maps);this.maps={};
    for(const rt of this.edgeMaps.values())rt.dispose();this.edgeMaps.clear();
    this.uvBakeMaterial?.dispose();this.uvBakeMaterial=null;
    onProgress('Rasterizing UV geometry');
    await new Promise(requestAnimationFrame);
    this._bakeRaster();
    onProgress('Ray tracing ambient occlusion, bent normals and thickness');
    await new Promise(requestAnimationFrame);
    this._bakeRays();
    onProgress('Building material layers');
    this.dirtyFrom=0;this.dirtyChannels=new Set(CHANNELS);
    this.dirtySmart.clear();
    this._resetMasksForResolution();
    this.compose();
  }
  _mask(layer){
    if(this.paintMasks.has(layer.id))return this.paintMasks.get(layer.id);
    const rt=target(this.size);
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0xffffff,1);
    this.renderer.clear(true,true,true);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x11151c,1);
    this.paintMasks.set(layer.id,rt);
    return rt;
  }
  _resetMasksForResolution(){
    for(const rt of this.paintMasks.values())rt.dispose();
    this.paintMasks.clear();
    for(const rt of this.smartMasks.values())rt.dispose();this.smartMasks.clear();
    for(const rt of this.effectMasks.values())rt.dispose();this.effectMasks.clear();this.dirtyEffects.clear();
    this.maskScratch?.dispose();this.maskScratch=null;
    disposeTargets(this.composites);
    this.composites=[];
    this.dirtyChannels=new Set(CHANNELS);
    this.dirtySmart.clear();
  }
  fillMask(layer,value=1){
    const rt=this._mask(layer);
    const v=value>0.5?1:0;
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(new THREE.Color(v,v,v),1);
    this.renderer.clear(true,true,true);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x11151c,1);
    this.markDirty(Math.max(0,this.layers.findIndex(x=>x.id===layer.id)));
  }
  _renderEffect(layer,effect,bounds){
    if(effect.mask===0)return this.whiteTexture;
    const width=this.interactive?Math.min(this.size,512):this.size;
    const key=effect.id;
    let rt=this.effectMasks.get(key);
    if(rt && rt.width!==width){rt.dispose();this.effectMasks.delete(key);rt=null;}
    if(!rt){rt=target(width);this.effectMasks.set(key,rt);this.dirtyEffects.add(key);}
    if(!this.dirtyEffects.has(key))return rt.texture;
    if(!this.smartMaterial){
      const names=['uPosition','uNormal','uEdges','uAO','uThickness','uCurvature',
        'uMask','uInvert','uSeed','uScale','uContrast','uBreakup',
        'uBreakupHardness','uBreakupPosition','uBreakupWidth','uEdgeDistance',
        'uAngleThreshold','uSoftness','uDensity','uLength','uWidth',
        'uDirection','uGravity','uCavity','uAOProtect','uTopBias',
        'uBreakupScale','uMin','uSize'];
      this.smartMaterial=shader(quadVert,smartFrag,Object.fromEntries(names.map(n=>[n,U(null)])));
    }
    const u=this.smartMaterial.uniforms;
    const edgeAware=[1,2,9,10,11].includes(effect.mask);
    const e=edgeAware?this._edgeMap(effect.angleThreshold??20,this.interactive):this.maps.edges;
    const values={
      uPosition:this.maps.position.texture,uNormal:this.maps.worldNormal.texture,
      uEdges:e.texture,uAO:this.maps.ao.texture,
      uThickness:this.maps.thickness.texture,uCurvature:this.maps.curvature.texture,
      uMask:effect.mask,uInvert:effect.maskInvert?1:0,uSeed:effect.seed??layer.seed??0,
      uScale:effect.scale??3,uContrast:effect.contrast??1,uBreakup:effect.breakup??0,
      uBreakupHardness:effect.breakupHardness??.55,
      uBreakupPosition:effect.breakupPosition??.53,uBreakupWidth:effect.breakupWidth??.60,
      uEdgeDistance:effect.edgeDistance??.035,uAngleThreshold:effect.angleThreshold??180,
      uSoftness:effect.softness??.35,uDensity:effect.density??.36,
      uLength:effect.length??.8,uWidth:effect.width??.035,
      uDirection:effect.direction??35,uGravity:effect.gravity??1,
      uCavity:effect.cavity??.65,uAOProtect:effect.aoProtect??.35,
      uTopBias:effect.topBias??.75,uBreakupScale:effect.breakupScale??1,
      uMin:bounds.min,uSize:bounds.getSize(this._boundsSize||(this._boundsSize=new THREE.Vector3()))
    };
    for(const [name,value] of Object.entries(values))u[name].value=value;
    this._draw(this.smartMaterial,rt);
    rt.texture.magFilter=THREE.LinearFilter;
    rt.texture.minFilter=THREE.LinearFilter;
    this.dirtyEffects.delete(key);
    return rt.texture;
  }
  _renderSmartMask(layer,bounds){
    // Backward-compatible fallback for projects predating stacked effects.
    const effects=layer.masks||[layer];
    const width=this.interactive?Math.min(this.size,512):this.size;
    let out=this.smartMasks.get(layer.id);
    if(out && out.width!==width){out.dispose();this.smartMasks.delete(layer.id);out=null;}
    if(!out){out=target(width);this.smartMasks.set(layer.id,out);this.dirtySmart.add(layer.id);}
    if(!this.dirtySmart.has(layer.id))return out;
    const enabled=effects.filter(e=>e.enabled!==false);
    if(!this.maskBlendMaterial)this.maskBlendMaterial=shader(quadVert,maskBlendFrag,{
      uPrevious:U(this.whiteTexture),uEffect:U(this.whiteTexture),
      uMode:U(0),uOpacity:U(1)
    });
    if(!this.maskScratch || this.maskScratch.width!==width){
      this.maskScratch?.dispose();this.maskScratch=target(width);
    }
    let previous=this.whiteTexture;
    if(!enabled.length){
      const u=this.maskBlendMaterial.uniforms;
      u.uPrevious.value=this.whiteTexture;u.uEffect.value=this.whiteTexture;
      u.uMode.value=0;u.uOpacity.value=1;
      this._draw(this.maskBlendMaterial,out);
    }
    for(let i=0;i<enabled.length;i++){
      const effect=enabled[i];
      const t=this._renderEffect(layer,effect,bounds);
      const u=this.maskBlendMaterial.uniforms;
      u.uPrevious.value=previous;
      u.uEffect.value=t;
      u.uMode.value=i===0?1:['replace','multiply','add','subtract','max','min'].indexOf(effect.combine||'multiply');
      u.uMode.value=Math.max(0,u.uMode.value);
      u.uOpacity.value=effect.opacity??1;
      const dst=i%2===(enabled.length-1)%2?out:this.maskScratch;
      this._draw(this.maskBlendMaterial,dst);
      previous=dst.texture;
    }
    out.texture.magFilter=THREE.LinearFilter;out.texture.minFilter=THREE.LinearFilter;
    this.dirtySmart.delete(layer.id);
    return out;
  }
  markDirty(index=0,{smart=true,channel=null,maskId=null,effectChanged=true}={}){
    this.dirtyFrom=Math.min(this.dirtyFrom,Math.max(0,index));
    if(channel&&CHANNELS.includes(channel))this.dirtyChannels.add(channel);
    else CHANNELS.forEach(name=>this.dirtyChannels.add(name));
    if(smart&&this.layers[index]){
      const layer=this.layers[index];
      this.dirtySmart.add(layer.id);
      if(effectChanged){
        const effects=layer.masks||[layer];
        for(const effect of effects)if(maskId===null||maskId===effect.id)this.dirtyEffects.add(effect.id);
      }
    }
  }
  compose(layers=this.layers,interactive=false){
    this.layers=layers;
    this.interactive=interactive;
    if(!this.maps.position)return;
    // Rebuild any temporary half/quarter-size masks before final-quality output.
    if(!interactive)for(const [id,rt] of this.smartMasks){
      if(rt.width!==this.size){
        const index=layers.findIndex(l=>l.id===id);
        if(index>=0)this.markDirty(index,{smart:true});
      }
    }
    let start=Math.min(this.dirtyFrom,this.composites.length);
    const geometryBounds=this.model.geometry.boundingBox;
    const uniforms={
      uPrevious:U(null),uPosition:U(this.maps.position.texture),
      uNormal:U(this.maps.worldNormal.texture),uSmartMask:U(this.whiteTexture),
      uPaint:U(null),uImage:U(this.whiteTexture),uHasImage:U(0),
      uMode:U(0),uHasPrevious:U(0),uProjection:U(1),
      uColor:U(new THREE.Color()),uRoughness:U(.6),uMetallic:U(0),
      uHeight:U(0),uOpacity:U(1),uScale:U(1),uSeed:U(0),uStrength:U(.3)
    };
    if(!this.layerMaterial)this.layerMaterial=shader(quadVert,layerFrag,uniforms);
    const mat=this.layerMaterial;
    // Update cached uniforms directly; do not mutate temporary objects.
    const live=mat.uniforms;
    live.uPosition.value=this.maps.position.texture;
    live.uNormal.value=this.maps.worldNormal.texture;
    const channelSet=this.dirtyChannels;
    // During scrubbing, refresh only one visible channel; defer the rest.
    // At 2K this avoids three-quarters of the expensive full-screen blends.
    const priority=this.channel!=='material'&&channelSet.has(this.channel)
      ?this.channel:(channelSet.has('baseColor')?'baseColor':channelSet.values().next().value);
    const activeChannels=interactive&&this.channel==='smartMask'
      ?new Set():interactive&&channelSet.size>1?new Set(priority?[priority]:[]):channelSet;
    // Compose only dirty layers AND material channels; previous outputs remain cached.
    for(let i=start;i<layers.length;i++){
      const layer=layers[i];
      if(!this.composites[i])this.composites[i]={};
      // Evaluate expensive geometry, weathering and scratch generator ONCE per layer.
      // Four PBR channels reuse this cached GPU smart mask.
      const smart=this._renderSmartMask(layer,geometryBounds);
      live.uSmartMask.value=smart.texture;
      for(let channel=0;channel<CHANNELS.length;channel++){
        const name=CHANNELS[channel];
        if(!activeChannels.has(name) && this.composites[i][name])continue;
        if(!this.composites[i][name])this.composites[i][name]=target(this.size);
        const previous=i>0?this.composites[i-1][name]?.texture:null;
        if(!layer.visible && previous){
          // Hidden layers still get a cache copy, so later dependencies remain stable.
          const copy=shader(quadVert,copyFrag,{uTexture:U(previous),uMode:U(0)});
          this._draw(copy,this.composites[i][name]);copy.dispose();
          continue;
        }
        live.uPrevious.value=previous;
        live.uHasPrevious.value=previous?1:0;
        live.uPaint.value=this._mask(layer).texture;
        const img=this.imageTextures.get(layer.id);
        live.uImage.value=img||this.whiteTexture;
        live.uHasImage.value=img?1:0;
        live.uMode.value=channel;
        live.uProjection.value=layer.projection==='triplanar'?1:0;
        live.uColor.value.set(layer.color);
        live.uRoughness.value=layer.roughness;
        live.uMetallic.value=layer.metallic;
        live.uHeight.value=layer.height;
        live.uOpacity.value=layer.visible?layer.opacity:0;
        live.uScale.value=layer.scale;
        live.uSeed.value=layer.seed;
        live.uStrength.value=layer.variation;
        this._draw(mat,this.composites[i][name]);
      }
    }
    for(let i=layers.length;i<this.composites.length;i++)disposeTargets(this.composites[i]);
    this.composites.length=layers.length;
    const active=new Set(layers.map(l=>l.id));
    for(const [id,rt] of this.smartMasks)if(!active.has(id)){rt.dispose();this.smartMasks.delete(id);}
    const masksActive=new Set(layers.flatMap(layer=>(layer.masks||[layer]).map(effect=>effect.id)));
    for(const [id,rt] of this.effectMasks)if(!masksActive.has(id)){rt.dispose();this.effectMasks.delete(id);this.dirtyEffects.delete(id);}
    for(const [id,rt] of this.paintMasks)if(!active.has(id)){rt.dispose();this.paintMasks.delete(id);}
    if(interactive){
      for(const name of activeChannels)this.dirtyChannels.delete(name);
      this.dirtyFrom=this.dirtyChannels.size?start:layers.length;
      // Only the changed material channels are recomposited while a slider is dragged.
      // Defer 20 expensive dilation passes and height-to-normal until interaction stops.
      this._updateMaterial();
      return;
    }
    this.dirtyFrom=layers.length;
    this.dirtyChannels.clear();
    this._padFinal('height',this.composites.at(-1)?.height);
    this._bakeNormalFromHeight();
    for(const name of ['baseColor','roughness','metalness'])this._padFinal(name,this.composites.at(-1)?.[name]);
    this._padFinal('normal',this.normalResult);
    this._updateMaterial();
  }
  _padFinal(name,source){
    if(!source)return;
    if(this.padded[name] && this.padded[name].width!==this.size){this.padded[name].dispose();this.padded[name]=null;}
    if(!this.padded[name])this.padded[name]=target(this.size);
    if(!this.padScratch || this.padScratch.width!==this.size){this.padScratch?.dispose();this.padScratch=target(this.size);}
    const mat=shader(quadVert,padFrag,{uTexture:U(source.texture),uTexel:U(new THREE.Vector2(1/this.size,1/this.size))});
    let current=source;
    for(let pass=0;pass<4;pass++){
      const output=pass%2===0?this.padScratch:this.padded[name];
      mat.uniforms.uTexture.value=current.texture;
      this._draw(mat,output);
      current=output;
    }
    mat.dispose();
    this.padded[name].texture.minFilter=THREE.LinearFilter;
    this.padded[name].texture.magFilter=THREE.LinearFilter;
  }
  _bakeNormalFromHeight(){
    if(this.normalResult && this.normalResult.width!==this.size){this.normalResult.dispose();this.normalResult=null;}
    if(!this.normalResult)this.normalResult=target(this.size);
    const last=this.composites.at(-1);
    const mat=shader(quadVert,normalFrag,{
      uHeight:U(this.padded.height?.texture||last?.height?.texture||this.maps.height.texture),
      uCoverage:U(this.maps.position.texture),
      uTexel:U(new THREE.Vector2(1/this.size,1/this.size)),
      uStrength:U(8)
    });
    this._draw(mat,this.normalResult);mat.dispose();
  }
  _updateMaterial(){
    const last=this.composites.at(-1);
    const oldFlags=[!!this.previewMaterial.map,!!this.previewMaterial.roughnessMap,
      !!this.previewMaterial.metalnessMap,!!this.previewMaterial.normalMap];
    this.previewMaterial.map=(this.interactive?null:this.padded.baseColor?.texture)||last?.baseColor?.texture||null;
    this.previewMaterial.roughnessMap=(this.interactive?null:this.padded.roughness?.texture)||last?.roughness?.texture||null;
    this.previewMaterial.metalnessMap=(this.interactive?null:this.padded.metalness?.texture)||last?.metalness?.texture||null;
    this.previewMaterial.normalMap=this.padded.normal?.texture||this.normalResult?.texture||null;
    this.previewMaterial.color.set(0xffffff);
    this.previewMaterial.roughness=1;
    this.previewMaterial.metalness=1;
    const newFlags=[!!this.previewMaterial.map,!!this.previewMaterial.roughnessMap,
      !!this.previewMaterial.metalnessMap,!!this.previewMaterial.normalMap];
    if(oldFlags.some((flag,i)=>flag!==newFlags[i]))this.previewMaterial.needsUpdate=true;
  }
  getPreviewTexture(){
    const last=this.composites.at(-1);
    const outputs={
      material:(this.interactive?null:this.padded.baseColor?.texture)||last?.baseColor?.texture,
      baseColor:(this.interactive?null:this.padded.baseColor?.texture)||last?.baseColor?.texture,
      roughness:(this.interactive?null:this.padded.roughness?.texture)||last?.roughness?.texture,
      metalness:(this.interactive?null:this.padded.metalness?.texture)||last?.metalness?.texture,
      height:(this.interactive?null:this.padded.height?.texture)||last?.height?.texture,
      normal:this.padded.normal?.texture||this.normalResult?.texture,
      ao:this.maps.ao?.texture,curvature:this.maps.curvature?.texture,
      thickness:this.maps.thickness?.texture,position:this.maps.position?.texture,
      id:this.maps.id?.texture,worldNormal:this.maps.worldNormal?.texture,
      elevation:this.maps.elevation?.texture,opacity:this.maps.opacity?.texture,
      smartMask:this.smartMasks.get(this.selectedLayerId)?.texture,
      bentNormal:this.maps.bentNormal?.texture
    };
    return outputs[this.channel]||null;
  }
  selectView(view,channel){
    this.view=view;
    this.channel=channel;
    this.controls.enabled=view==='3d';
    if(view==='3d' && this.mesh){
      if(channel==='material')this.mesh.material=this.previewMaterial;
      else{
        if(!this.channelMaterial)this.channelMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
        const next=this.getPreviewTexture();
        if(Boolean(this.channelMaterial.map)!==Boolean(next))this.channelMaterial.needsUpdate=true;
        this.channelMaterial.map=next;
        this.mesh.material=this.channelMaterial;
      }
    }
  }
  pick(clientX,clientY){
    if(!this.mesh || this.view!=='3d')return null;
    const rect=this.renderer.domElement.getBoundingClientRect();
    const coords=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(coords,this.camera);
    const hit=this.raycaster.intersectObject(this.mesh,false)[0];
    if(!hit)return null;
    return {point:hit.point.clone(),normal:hit.face.normal.clone()};
  }
  paint(layer,hit,erase=false,radius=.15,hardness=.55,strength=.7){
    if(!layer||!hit||!this.maps.position)return;
    const src=this._mask(layer);
    const dst=target(this.size);
    const mat=shader(quadVert,brushFrag,{
      uPrevious:U(src.texture),uPosition:U(this.maps.position.texture),
      uNormal:U(this.maps.worldNormal.texture),
      uPoint:U(hit.point),uBrushNormal:U(hit.normal),
      uRadius:U(radius),uHardness:U(hardness),uStrength:U(strength),
      uValue:U(erase?0:1)
    });
    this._draw(mat,dst);mat.dispose();
    src.dispose();
    this.paintMasks.set(layer.id,dst);
    const index=this.layers.findIndex(x=>x.id===layer.id);
    this.dirtyFrom=Math.min(this.dirtyFrom,Math.max(0,index));
  }
  async mapPNG(rt,mode=0){
    const tex=rt?.texture;
    if(!tex)throw Error('No texture available. Bake the mesh first.');
    const exportTarget=target(this.size,THREE.UnsignedByteType);
    const bounds=this.model.geometry.boundingBox;
    const mat=shader(quadVert,copyFrag,{uTexture:U(tex),uMode:U(mode),
      uMin:U(bounds.min.clone()),uSize:U(bounds.getSize(new THREE.Vector3()))});
    this._draw(mat,exportTarget);mat.dispose();
    const w=this.size,h=this.size,read=new Uint8Array(w*h*4);
    this.renderer.readRenderTargetPixels(exportTarget,0,0,w,h,read);
    exportTarget.dispose();
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    const pixels=ctx.createImageData(w,h);
    // OpenGL readbacks are bottom-up, PNG image rows are top-down.
    for(let y=0;y<h;y++)pixels.data.set(read.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
    ctx.putImageData(pixels,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('PNG encoding failed.');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async exportMaps(){
    if(!this.maps.position)throw Error('Bake maps before exporting');
    const last=this.composites.at(-1);
    const all={
      BaseColor:[this.padded.baseColor||last?.baseColor,1],Roughness:[this.padded.roughness||last?.roughness,2],
      Metallic:[this.padded.metalness||last?.metalness,2],Normal:[this.padded.normal||this.normalResult,0],
      Height:[this.padded.height||last?.height,2],AO:[this.maps.ao,2],
      Curvature:[this.maps.curvature,2],Position:[this.maps.position,3],
      WorldNormal:[this.maps.worldNormal,0],Thickness:[this.maps.thickness,2],
      BentNormal:[this.maps.bentNormal,0],ID:[this.maps.id,0],
      Elevation:[this.maps.elevation,2],Opacity:[this.maps.opacity,2]
    };
    const files={};
    for(const [name,[rt,mode]] of Object.entries(all)){
      if(rt)files[name+'.png']=await this.mapPNG(rt,mode);
    }
    // Export each authored smart mask for use in Unity or external material workflows.
    for(let i=0;i<this.layers.length;i++){
      const layer=this.layers[i];
      const mask=this.smartMasks.get(layer.id);
      if(!(layer.masks||[layer]).some(e=>e.mask!==0) || !mask)continue;
      const slug=layer.name.replace(/[^a-z0-9_-]+/gi,'_').slice(0,50)||'Mask';
      files['SmartMask_'+String(i+1).padStart(2,'0')+'_'+slug+'.png']=await this.mapPNG(mask,2);
    }
    return files;
  }
  async setLayerImage(layer){
    const old=this.imageTextures.get(layer.id);
    if(old){old.dispose();this.imageTextures.delete(layer.id);}
    if(!layer.imageData){this.markDirty(Math.max(0,this.layers.findIndex(x=>x.id===layer.id)));return;}
    const img=await new Promise((resolve,reject)=>new THREE.TextureLoader().load(layer.imageData,resolve,undefined,reject));
    img.wrapS=THREE.RepeatWrapping;img.wrapT=THREE.RepeatWrapping;
    img.colorSpace=THREE.SRGBColorSpace;
    img.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    img.needsUpdate=true;this.imageTextures.set(layer.id,img);
    this.markDirty(Math.max(0,this.layers.findIndex(x=>x.id===layer.id)));
  }
  clearLayerImages(){for(const image of this.imageTextures.values())image.dispose();this.imageTextures.clear();}
  async capturePaintMasks(){
    const masks={};
    for(const [id,rt] of this.paintMasks.entries())masks[id]=Array.from(await this.mapPNG(rt,2));
    return masks;
  }
  async restorePaintMasks(masks){
    for(const [id,bytes] of Object.entries(masks||{})){
      if(!this.layers.find(l=>l.id===id))continue;
      const blob=new Blob([new Uint8Array(bytes)],{type:'image/png'});
      const bitmap=await createImageBitmap(blob);
      const tex=new THREE.Texture(bitmap);
      tex.colorSpace=THREE.NoColorSpace;
      tex.needsUpdate=true;
      const rt=target(this.size);
      const mat=shader(quadVert,copyFrag,{uTexture:U(tex),uMode:U(0)});
      this._draw(mat,rt);mat.dispose();tex.dispose();bitmap.close();
      this.paintMasks.get(id)?.dispose();
      this.paintMasks.set(id,rt);
    }
    this.dirtyFrom=0;this.compose();
  }
  setResolution(size){this.size=Math.min(2048,Math.max(256,size|0));}
  dispose(){
    this._running=false;this._resizer.disconnect();
    disposeTargets(this.maps);disposeTargets(this.composites);disposeTargets(this.padded);
    this.features?.dispose();this.uvBakeMaterial?.dispose();
    for(const rt of this.edgeMaps.values())if(rt!==this.maps.edges)rt.dispose();this.edgeMaps.clear();
    for(const rt of this.effectMasks.values())rt.dispose();this.effectMasks.clear();
    this.maskScratch?.dispose();this.maskBlendMaterial?.dispose();
    this.smartMaterial?.dispose();this.layerMaterial?.dispose();
    for(const rt of this.smartMasks.values())rt.dispose();this.smartMasks.clear();
    this.padScratch?.dispose();
    this.clearLayerImages();this.whiteTexture.dispose();
    for(const rt of this.paintMasks.values())rt.dispose();
    this.bvh?.dispose();this.normalResult?.dispose();
    this.controls.dispose();this.renderer.dispose();
  }
}
