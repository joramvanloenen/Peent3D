import './style.css';
import * as THREE from 'three';
import {zipSync,gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate';
import {PeentGPU} from './gpu.js';
import {createDemoMesh,loadMesh,prepareScene} from './geometry.js';

const $=id=>document.getElementById(id);
const masks=[
  ['None / full surface',0],['Convex edges',1],['Concave cavities',2],
  ['Ambient occlusion',3],['Top facing height',4],['Bottom accumulation',5],
  ['Thin parts',6],['Procedural noise',7]
];
const presets=[
  {name:'Brushed alloy',color:'#929aa0',roughness:.32,metallic:1,mask:0,projection:'triplanar',scale:4,variation:.28},
  {name:'Painted enamel',color:'#4e8885',roughness:.44,metallic:0,mask:0,projection:'triplanar',scale:2.5,variation:.20},
  {name:'Edge wear',color:'#c7c9c6',roughness:.24,metallic:1,mask:1,projection:'triplanar',scale:8,variation:.35},
  {name:'Cavity dirt',color:'#302d29',roughness:.9,metallic:0,mask:3,projection:'triplanar',scale:6,variation:.45},
  {name:'Oxidation',color:'#74472e',roughness:.85,metallic:0,mask:7,projection:'triplanar',scale:5,variation:.5}
];
let nextId=1;
function newLayer(partial={}){
  return Object.assign({
    id:'layer-'+(nextId++),name:'New material',
    color:'#8c929b',roughness:.58,metallic:0,height:0,
    opacity:1,scale:3,contrast:2,variation:.26,seed:Math.random()*100,
    projection:'triplanar',mask:0,visible:true
  },partial);
}
let layers=[newLayer(presets[0]),newLayer(presets[1]),newLayer(presets[2]),newLayer(presets[3])];
let selected=layers.at(-1)?.id;
let tool='orbit',uvTab=false,painting=false,lastPaintPoint=null;
let brushRadius=.17,brushHardness=.55,brushStrength=.72;
let scheduled=false,busy=false;
let gpu;
try {
  gpu=new PeentGPU($('viewport'));
  if(!gpu.renderer.capabilities.isWebGL2)throw Error('WebGL2 is required for GPU mesh-map baking.');
  $('gpu-info').textContent='GPU · '+gpu.gpuName;
} catch(error) {
  $('viewport').textContent='GPU initialization failed: '+error.message;
  throw error;
}
gpu.layers=layers;
function status(message){$('status').textContent=message;}
function currentLayer(){return layers.find(l=>l.id===selected);}
function mark(index=0){
  gpu.markDirty(index);
  if(!scheduled){
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;gpu.compose(layers);refreshPreview();});
  }
}
function refreshPreview(){gpu.selectView(uvTab?'uv':'3d',$('channel-view').value);}
function button(text,click,className=''){
  const b=document.createElement('button');b.textContent=text;
  if(className)b.className=className;
  b.addEventListener('click',click);return b;
}
function renderLayers(){
  const root=$('layer-list');root.replaceChildren();
  for(let i=layers.length-1;i>=0;i--){
    const layer=layers[i];
    const row=document.createElement('div');
    row.className='layer'+(layer.id===selected?' selected':'');
    const eye=button(layer.visible?'◉':'○',e=>{e.stopPropagation();layer.visible=!layer.visible;mark(i);renderLayers();});
    eye.className='eye';
    const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=layer.color;
    const label=document.createElement('span');label.className='label';label.textContent=layer.name;
    const kind=document.createElement('span');kind.className='layer-kind';kind.textContent=layer.mask===0?'Fill':'Smart';
    row.append(eye,swatch,label,kind);
    row.addEventListener('click',()=>{selected=layer.id;renderLayers();renderProperties();});
    root.append(row);
  }
}
function renderProperties(){
  const root=$('layer-properties');root.replaceChildren();
  const layer=currentLayer();
  if(!layer){root.textContent='Select a layer';return;}
  function section(text){const e=document.createElement('div');e.className='section-label';e.textContent=text;root.append(e);}
  function row(name,element,onChange,event='input',suffix=''){
    const wrapper=document.createElement('div');wrapper.className='row';
    const label=document.createElement('label');label.textContent=name;
    wrapper.append(label,element);
    if(suffix){const out=document.createElement('output');out.textContent=suffix;wrapper.append(out);
      element.addEventListener('input',()=>out.textContent=String(element.value));}
    element.addEventListener(event,()=>{
      onChange(element.value);
      const idx=layers.indexOf(layer);mark(idx);
      if(name==='Name'||name==='Color')renderLayers();
    });
    root.append(wrapper);
  }
  function textInput(name,field){
    const input=document.createElement('input');input.type='text';input.value=layer[field];
    row(name,input,value=>layer[field]=value,'change');
  }
  function colorInput(){
    const input=document.createElement('input');input.type='color';input.value=layer.color;
    row('Color',input,value=>layer.color=value);
  }
  function slider(name,field,min,max,step){
    const input=document.createElement('input');input.type='range';
    Object.assign(input,{min:String(min),max:String(max),step:String(step),value:String(layer[field])});
    row(name,input,value=>layer[field]=Number(value),'input',String(layer[field]));
  }
  function dropdown(name,field,options){
    const el=document.createElement('select');
    for(const [text,value] of options){
      const opt=document.createElement('option');opt.textContent=text;opt.value=String(value);
      if(String(layer[field])===String(value))opt.selected=true;
      el.append(opt);
    }
    row(name,el,value=>layer[field]=typeof layer[field]==='number'?Number(value):value,'change');
  }
  section('Material');
  textInput('Name','name');colorInput();
  slider('Roughness','roughness',0,1,.01);
  slider('Metallic','metallic',0,1,.01);
  slider('Relief height','height',-.45,.45,.005);
  slider('Opacity','opacity',0,1,.01);
  section('Projection & detail');
  dropdown('Projection','projection',[['Triplanar','triplanar'],['UV','uv']]);
  slider('Pattern scale','scale',.1,20,.1);
  slider('Variation','variation',0,1,.01);
  section('Smart mask');
  dropdown('Mask generator','mask',masks);
  slider('Mask contrast','contrast',.2,8,.1);
  const hint=document.createElement('p');hint.className='property-help';
  hint.textContent='Smart masks use baked AO, curvature, thickness and position maps. Paint/erase modifies this layer’s editable mask in 3D, including across UV seams.';
  root.append(hint);
  section('Brush');
  const controls=[
    ['Radius',brushRadius,.015,.6,.005,value=>brushRadius=value],
    ['Hardness',brushHardness,.01,.99,.01,value=>brushHardness=value],
    ['Strength',brushStrength,.05,1,.01,value=>brushStrength=value]
  ];
  for(const [label,initial,min,max,step,store] of controls){
    const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=initial;
    const wrap=document.createElement('div');wrap.className='row';
    const l=document.createElement('label');l.textContent=label;
    const out=document.createElement('output');out.textContent=Number(initial).toFixed(2);
    input.addEventListener('input',()=>{store(Number(input.value));out.textContent=Number(input.value).toFixed(2);});
    wrap.append(l,input,out);root.append(wrap);
  }
}
function addLayer(template={}){
  const layer=newLayer(template);
  const i=layers.findIndex(l=>l.id===selected);
  layers.splice(i+1,0,layer);selected=layer.id;
  mark(Math.max(0,i+1));renderLayers();renderProperties();
}
function moveLayer(amount){
  const i=layers.findIndex(l=>l.id===selected),dest=i+amount;
  if(i<0||dest<0||dest>=layers.length)return;
  const [layer]=layers.splice(i,1);layers.splice(dest,0,layer);
  mark(Math.min(i,dest));renderLayers();
}
$('btn-add-layer').onclick=()=>addLayer(presets[4]);
$('btn-remove-layer').onclick=()=>{
  if(layers.length<=1){status('At least one layer is required');return;}
  const i=layers.findIndex(l=>l.id===selected);
  if(i<0)return;
  layers.splice(i,1);selected=layers[Math.min(i,layers.length-1)].id;
  mark(i);renderLayers();renderProperties();
};
$('btn-layer-up').onclick=()=>moveLayer(1);
$('btn-layer-down').onclick=()=>moveLayer(-1);

async function bake(){
  if(busy)return;
  busy=true;$('btn-bake').disabled=true;
  try{
    gpu.sampleCount=Number($('samples').value);
    gpu.rayDistance=Number($('ray-distance').value);
    const newSize=Number($('resolution').value);
    if(newSize!==gpu.size)gpu.setResolution(newSize);
    await gpu.bake(status);
    refreshPreview();
    if(gpu.model.missingUVs)status('Baked · triangle-atlas fallback UVs. Author UVs for best results.');
    else status('Mesh maps baked · '+gpu.size+'px');
  }catch(error){console.error(error);status('Bake error: '+error.message);}
  finally{busy=false;$('btn-bake').disabled=false;}
}
$('btn-bake').onclick=bake;
$('ray-distance').oninput=e=>$('ray-distance-value').textContent=Number(e.target.value).toFixed(2);
$('channel-view').onchange=refreshPreview;
$('tab-3d').onclick=()=>{uvTab=false;toggleView();};
$('tab-uv').onclick=()=>{uvTab=true;toggleView();};
function toggleView(){
  $('tab-3d').classList.toggle('selected',!uvTab);
  $('tab-uv').classList.toggle('selected',uvTab);
  refreshPreview();
}
function setTool(name){
  tool=name;
  ['orbit','paint','erase'].forEach(id=>$('tool-'+id).classList.toggle('active',id===name));
  const paintingTool=name!=='orbit';
  gpu.controls.enabled=!paintingTool&&!uvTab;
  gpu.renderer.domElement.style.cursor=paintingTool?'crosshair':'grab';
}
$('tool-orbit').onclick=()=>setTool('orbit');
$('tool-paint').onclick=()=>setTool('paint');
$('tool-erase').onclick=()=>setTool('erase');
$('btn-reset-camera').onclick=()=>gpu.frame();
const canvas=gpu.renderer.domElement;
canvas.addEventListener('pointerdown',e=>{
  if(tool==='orbit'||uvTab||e.button!==0||busy)return;
  painting=true;lastPaintPoint=null;canvas.setPointerCapture(e.pointerId);stroke(e);
});
canvas.addEventListener('pointermove',e=>{if(painting)stroke(e);});
function stroke(e){
  const layer=currentLayer(),hit=gpu.pick(e.clientX,e.clientY);
  if(!layer||!hit)return;
  if(lastPaintPoint && hit.point.distanceTo(lastPaintPoint)<brushRadius*.2)return;
  gpu.paint(layer,hit,tool==='erase',brushRadius,brushHardness,brushStrength);
  lastPaintPoint=hit.point;
  mark(layers.indexOf(layer));
}
function stop(){painting=false;lastPaintPoint=null;}
canvas.addEventListener('pointerup',stop);
canvas.addEventListener('pointercancel',stop);
canvas.addEventListener('lostpointercapture',stop);

async function useMesh(file){
  $('loading').classList.remove('hidden');
  status('Importing '+file.name);
  await new Promise(requestAnimationFrame);
  try{
    const result=await loadMesh(file);
    gpu.setGeometry(result);
    $('mesh-info').textContent=result.name+' · '+result.triangleCount.toLocaleString()+' tris · '+result.meshCount+' mesh(es)';
    await bake();
  }catch(error){console.error(error);status('Import failed: '+error.message);}
  finally{$('loading').classList.add('hidden');}
}
$('btn-import').onclick=()=>$('mesh-file').click();
$('mesh-file').onchange=e=>{if(e.target.files[0])useMesh(e.target.files[0]);e.target.value='';};
const viewport=$('viewport');
viewport.addEventListener('dragenter',e=>{e.preventDefault();viewport.classList.add('dragging');});
viewport.addEventListener('dragover',e=>e.preventDefault());
viewport.addEventListener('dragleave',e=>{if(!viewport.contains(e.relatedTarget))viewport.classList.remove('dragging');});
viewport.addEventListener('drop',e=>{
  e.preventDefault();viewport.classList.remove('dragging');
  const file=e.dataTransfer.files[0];if(file)useMesh(file);
});
async function writeFile(name,bytes){
  if(window.peentDesktop){
    const result=await window.peentDesktop.saveFile(name,bytes);
    if(result.error)throw Error(result.error);
    if(result.canceled)return false;
  }else{
    const url=URL.createObjectURL(new Blob([bytes]));
    const link=document.createElement('a');link.download=name;link.href=url;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  return true;
}
$('btn-export').onclick=async()=>{
  if(busy)return;
  busy=true;status('Encoding material and baked maps…');
  try{
    const maps=await gpu.exportMaps();
    const archive=zipSync(maps,{level:4});
    const base=(gpu.model?.name||'Peent3D').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'_');
    if(await writeFile(base+'_Maps.zip',archive))status('Exported '+Object.keys(maps).length+' maps to ZIP');
    else status('Export canceled');
  }catch(error){console.error(error);status('Export failed: '+error.message);}
  finally{busy=false;}
};
async function projectData(){
  const p=gpu.model.geometry.getAttribute('position');
  const n=gpu.model.geometry.getAttribute('normal');
  const uv=gpu.model.geometry.getAttribute('uv');
  return {
    format:'peent3d',version:1,name:gpu.model.name,resolution:gpu.size,
    samples:gpu.sampleCount,distance:gpu.rayDistance,layers,
    mesh:{position:Array.from(p.array),normal:Array.from(n.array),uv:Array.from(uv.array)},
    paintMasks:await gpu.capturePaintMasks()
  };
}
$('btn-project').onclick=async()=>{
  if(busy)return;
  busy=true;status('Saving editable project…');
  try{
    const data=await projectData();
    const binary=gzipSync(strToU8(JSON.stringify(data)),{level:5});
    const name=(gpu.model?.name||'Untitled').replace(/\.[^.]+$/,'')+'.peent';
    if(await writeFile(name,binary))status('Project saved');
    else status('Save canceled');
  }catch(error){console.error(error);status('Project save error: '+error.message);}
  finally{busy=false;}
};
$('btn-load').onclick=()=>$('project-file').click();
$('project-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';
  if(!file)return;
  busy=true;status('Loading project…');
  try{
    let bytes=new Uint8Array(await file.arrayBuffer());
    let data;
    try{data=JSON.parse(strFromU8(gunzipSync(bytes)));}
    catch{data=JSON.parse(strFromU8(bytes));}
    if(data.format!=='peent3d'||data.version!==1)throw Error('Unsupported Peent3D project version');
    const g=new THREE.BufferGeometry();
    for(const key of ['position','normal','uv']){
      const array=data.mesh?.[key];
      if(!Array.isArray(array)||array.length>30_000_000)throw Error('Invalid '+key+' mesh data');
      g.setAttribute(key,new THREE.Float32BufferAttribute(array,key==='uv'?2:3));
    }
    const result=prepareScene(new THREE.Mesh(g,new THREE.MeshStandardMaterial()),data.name);
    gpu.setGeometry(result);
    layers=data.layers.map(l=>newLayer(l));
    nextId=Math.max(nextId,...layers.map(l=>Number(l.id.split('-').at(-1))||0))+1;
    selected=layers.at(-1)?.id;
    gpu.layers=layers;
    $('resolution').value=data.resolution;
    $('samples').value=data.samples;
    $('ray-distance').value=data.distance;
    gpu.setResolution(data.resolution);
    gpu.sampleCount=data.samples;
    gpu.rayDistance=data.distance;
    await gpu.bake(status);
    await gpu.restorePaintMasks(data.paintMasks);
    $('mesh-info').textContent=result.name+' · '+result.triangleCount+' tris';
    renderLayers();renderProperties();refreshPreview();status('Project loaded');
  }catch(error){console.error(error);status('Open project failed: '+error.message);}
  finally{busy=false;}
};
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('btn-project').click();}
  if(e.ctrlKey&&e.key.toLowerCase()==='o'){e.preventDefault();$('btn-import').click();}
  if(e.key.toLowerCase()==='b')setTool('paint');
  if(e.key.toLowerCase()==='e')setTool('erase');
  if(e.key.toLowerCase()==='v')setTool('orbit');
  if(e.key.toLowerCase()==='f')gpu.frame();
});
renderLayers();renderProperties();refreshPreview();
gpu.setGeometry(createDemoMesh());
$('mesh-info').textContent='Demo torus knot · '+gpu.model.triangleCount.toLocaleString()+' tris';
bake();
