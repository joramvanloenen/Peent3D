import './style.css';
import * as THREE from 'three';
import {zipSync,gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate';
import {PeentGPU} from './gpu.js';
import {createDemoMesh,loadMesh,prepareScene} from './geometry.js';

const $=id=>document.getElementById(id);
const masks=[
 ['Full surface',0],['Edge wear · convex',1],['Cavities · concave',2],
 ['Ambient occlusion',3],['Upper height',4],['Lower height',5],
 ['Thin parts',6],['Organic grunge',7],['Gravity streaks',8],
 ['Leaks / drips',9],['Rust / oxidation',10],['Settled dust',11],
 ['Natural scratches',12],['Signed mean curvature',13]
];
const maskDescription={
 0:'Unmasked material fill. Paint black to hide or white to reveal.',
 1:'Convex shared mesh edges: real face angles and model-space edge distance. No UV-space smearing.',
 2:'Concave edges, from the signed angle between adjoining polygon faces.',
 3:'Ray-baked ambient occlusion collects dirt inside occluded recesses.',
 4:'Soft height gradient toward the top of the asset.',
 5:'Soft height gradient toward the bottom of the asset.',
 6:'Inward ray thickness approximation highlights thin parts.',
 7:'Layered 3D coherent noise suitable for organic wear.',
 8:'Thin gravity-aligned streaks on vertical surfaces, with variable length and spacing.',
 9:'Localized drips guided by cavity/edge information and gravity.',
 10:'Patchy, cavity-biased oxidation with secondary leaking and micro-corrosion.',
 11:'Soft upward-facing deposition, reinforced around occluded corners.',
 12:'Sparse, directional, variable-length micro-scratches projected in object space.',
 13:'Cotangent-weighted signed mean curvature on welded 3D vertices. Choose convex, concave, both or signed regions; smoothing is UV-seam independent.'
};
const PARAM_DEFAULTS=Object.freeze({
 roughness:.58,metallic:0,height:0,opacity:1,scale:3,variation:.08,
 contrast:1.5,breakup:.12,breakupScale:1,breakupHardness:.58,breakupPosition:.53,breakupWidth:.60,edgeDistance:.038,angleThreshold:180,
 softness:.36,density:.38,length:.85,width:.035,direction:25,
 gravity:1,cavity:.65,aoProtect:.35,topBias:.74,seed:0,
 meanCurvatureRegion:0,meanCurvatureSmoothing:.5,meanCurvatureCutoff:.12,meanCurvatureIntensity:2
});
const GENERATOR_DEFAULTS={
 0:{contrast:1,breakup:0},
 1:{edgeDistance:.038,angleThreshold:20,softness:.32,contrast:1.6,breakup:.58,breakupScale:1.8,breakupHardness:.68,breakupPosition:.53,breakupWidth:.63,aoProtect:.30,scale:4.4},
 2:{edgeDistance:.055,angleThreshold:18,softness:.5,contrast:1.4,breakup:.18,scale:3},
 3:{contrast:1.1,breakup:.12,scale:2.7},
 4:{contrast:1.1,breakup:.12,scale:2},
 5:{contrast:1.1,breakup:.12,scale:2},
 6:{contrast:1.2,breakup:.12,scale:3},
 7:{contrast:1.8,breakup:0,scale:2.1},
 8:{contrast:1.0,breakup:0,scale:1.15,density:.28,length:2.0,width:.105,direction:0},
 9:{contrast:1.0,breakup:0,scale:1.25,density:.23,length:1.95,width:.10,direction:0,cavity:.75},
 10:{contrast:1.0,breakup:.14,breakupScale:2.4,scale:3.0,density:.25,length:1.55,width:.095,cavity:.82},
 11:{contrast:1.10,breakup:.14,scale:2.1,topBias:.74,cavity:.32},
 12:{contrast:1.0,breakup:0,scale:1.55,density:.18,length:1.28,width:.040,direction:26},
 13:{angleThreshold:180,contrast:1,breakup:0,meanCurvatureRegion:0,meanCurvatureSmoothing:.5,meanCurvatureCutoff:.12,meanCurvatureIntensity:2}
};
const presets=[
  {name:'Base iron',color:'#777b7e',roughness:.47,metallic:.93,mask:0,projection:'triplanar',scale:3,variation:.05},
  {name:'Painted coating',color:'#677477',roughness:.53,metallic:.12,mask:0,projection:'triplanar',scale:2,variation:.015},
  {name:'Fine edge wear',color:'#b0a9a1',roughness:.31,metallic:1,mask:1,projection:'triplanar',variation:.04,opacity:.58,...GENERATOR_DEFAULTS[1]},
  {name:'Cavity deposits',color:'#41372e',roughness:.82,metallic:0,mask:3,projection:'triplanar',variation:.04,opacity:.25,...GENERATOR_DEFAULTS[3]},
  {name:'Iron oxidation',color:'#804834',roughness:.86,metallic:.12,mask:10,projection:'triplanar',variation:.14,opacity:.58,...GENERATOR_DEFAULTS[10]},
  {name:'Settled dust',color:'#b8b1a1',roughness:.92,metallic:0,mask:11,projection:'triplanar',variation:.04,opacity:.45,...GENERATOR_DEFAULTS[11]},
  {name:'Surface streaks',color:'#4d4840',roughness:.84,metallic:0,mask:8,projection:'triplanar',variation:.03,opacity:.5,...GENERATOR_DEFAULTS[8]},
  {name:'Gravity leaks',color:'#5b4636',roughness:.8,metallic:0,mask:9,projection:'triplanar',variation:.05,opacity:.68,...GENERATOR_DEFAULTS[9]},
  {name:'Fine scratches',color:'#c0b9b0',roughness:.35,metallic:.9,height:-.028,mask:12,projection:'triplanar',variation:.02,opacity:.54,...GENERATOR_DEFAULTS[12]}
];
let nextId=1,nextMaskId=1;
const MASK_PARAMS=['scale','seed','contrast','breakup','breakupScale','breakupHardness',
 'breakupPosition','breakupWidth','edgeDistance','angleThreshold','softness','density',
 'length','width','direction','gravity','cavity','aoProtect','topBias','maskInvert',
 'meanCurvatureRegion','meanCurvatureSmoothing','meanCurvatureCutoff','meanCurvatureIntensity'];
const EDGE_ANGLE_TYPES=new Set([1,2,9,10,11]);
function createMaskEntry(type=1,partial={},legacy=false){
 const defaults={...PARAM_DEFAULTS,...(GENERATOR_DEFAULTS[type]||{}),
   angleThreshold:EDGE_ANGLE_TYPES.has(type)?20:180};
 const entry={...defaults,mask:type,maskInvert:false,id:'mask-'+nextMaskId++,
   enabled:true,combine:'multiply',opacity:1};
 for(const key of MASK_PARAMS){
   if(partial[key]===undefined)continue;
   // Older single-mask projects had a generic angle threshold (22 degrees).
   // On non-edge generators this was never a meaningful setting; use 180 instead.
   if(legacy&&key==='angleThreshold'&&!EDGE_ANGLE_TYPES.has(type))continue;
   entry[key]=partial[key];
 }
 if(!legacy){
   if(partial.id?.startsWith('mask-'))entry.id=partial.id;
   if(partial.enabled!==undefined)entry.enabled=partial.enabled;
   if(partial.combine)entry.combine=partial.combine;
   if(partial.opacity!==undefined)entry.opacity=partial.opacity;
 }
 return entry;
}
function normalizeLayerMasks(layer,legacy=false){
 layer.masks=Array.isArray(layer.masks)
   ?layer.masks.map(e=>createMaskEntry(Number(e.mask??0),e,false))
   :[createMaskEntry(Number(layer.mask??0),layer,true)];
 return layer.masks;
}
function newLayer(partial={}){
 const mask=Number(partial.mask??0);
 const layer={
  id:'layer-'+nextId++,name:'New material',color:'#888888',
  ...PARAM_DEFAULTS,...(GENERATOR_DEFAULTS[mask]||{}),
  projection:'triplanar',mask,imageData:null,visible:true,
  seed:Math.random()*100,...partial
 };
 if(Array.isArray(partial.masks))normalizeLayerMasks(layer);
 else {
   const maskParams={...partial};delete maskParams.opacity;
   layer.masks=[createMaskEntry(mask,maskParams,!!partial.id&&partial.id.startsWith('layer-')&&partial.masks===undefined)];
 }
 return layer;
}
let layers=[newLayer(presets[0]),newLayer(presets[1]),newLayer(presets[2]),newLayer(presets[3])];
let selected=layers.at(-1)?.id;
let selectedMaskId=layers.at(-1)?.masks?.[0]?.id;
let tool='orbit',uvTab=false,painting=false,lastPaintPoint=null;
let brushRadius=.17,brushHardness=.55,brushStrength=.72;
const BRUSH_DEFAULTS={brushRadius:.17,brushHardness:.55,brushStrength:.72};
let scheduled=false,busy=false,settleTimer=null,sliderDragging=0;
const PREVIEW_SETTLE_MS=210;
const channelForField={color:'baseColor',roughness:'roughness',metallic:'metalness',height:'height'};
const materialFields=new Set(['color','roughness','metallic','height','opacity','visible','name','projection','variation']);
let imageTarget=null;
const imageFile=document.createElement('input');
imageFile.type='file';imageFile.accept='image/png,image/jpeg,image/webp';imageFile.hidden=true;
document.body.append(imageFile);
imageFile.addEventListener('change',async()=>{
 const file=imageFile.files?.[0];imageFile.value='';
 const layer=layers.find(l=>l.id===imageTarget);
 if(!file||!layer)return;
 if(file.size>16*1024*1024){status('Image exceeds 16 MiB');return;}
 try{
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
  layer.imageData=data;layer.color='#ffffff';await gpu.setLayerImage(layer);
  mark(layers.indexOf(layer));renderLayers();renderProperties();status('Loaded image fill: '+file.name);
 }catch(error){status('Image import failed: '+error.message);}
});
let gpu;
try{
 gpu=new PeentGPU($('viewport'));
 if(!gpu.renderer.capabilities.isWebGL2)throw Error('WebGL2 is required for GPU mesh-map baking.');
 $('gpu-info').textContent='GPU · '+gpu.gpuName;
}catch(error){$('viewport').textContent='GPU initialization failed: '+error.message;throw error;}
gpu.layers=layers;
function status(message){$('status').textContent=message;}
function currentLayer(){return layers.find(l=>l.id===selected);}
function mark(index=0,field=null,maskId=null,effectChanged=true){
 // Only masks or procedural parameters need smart-generator evaluation.
 // A roughness slider must not regenerate edge wear, AO-derived dirt, etc.
 const smart=maskId!==null||field===null||!materialFields.has(field);
 gpu.markDirty(index,{smart,channel:maskId===null?(channelForField[field]||null):null,maskId,effectChanged});
 if(!scheduled){
  scheduled=true;
  requestAnimationFrame(()=>{
   scheduled=false;
   if(busy)return;
   gpu.compose(layers,true);  // fast preview; no 20-pass UV dilation or normal bake
   refreshPreview();
  });
 }
 // Pay the expensive full-quality passes only after scrubbing ends.
 scheduleFinalize();
}
function scheduleFinalize(delay=PREVIEW_SETTLE_MS){
 clearTimeout(settleTimer);
 if(sliderDragging>0)return;
 settleTimer=setTimeout(()=>{
  if(busy)return;
  gpu.compose(layers,false);
  refreshPreview();
 },delay);
}
function refreshPreview(){
 gpu.selectedLayerId=selected;
 gpu.selectView(uvTab?'uv':'3d',$('channel-view').value);
 gpu.controls.enabled=tool==='orbit'&&!uvTab;
}
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
  const kind=document.createElement('span');kind.className='layer-kind';kind.textContent=layer.masks.length+' mask'+(layer.masks.length===1?'':'s');
  row.append(eye,swatch,label,kind);
  row.addEventListener('click',()=>{selected=layer.id;selectedMaskId=layer.masks[0]?.id;gpu.selectedLayerId=selected;renderLayers();renderProperties();refreshPreview();});
  root.append(row);
 }
}
function numericControl({name,value,min,max,step,defaultValue,onChange}){
 const wrap=document.createElement('div');wrap.className='number-control';
 const label=document.createElement('label');label.textContent=name;label.title=name;
 const slider=document.createElement('input');slider.type='range';slider.min=min;slider.max=max;slider.step=step;
 slider.title=name;
 const number=document.createElement('input');number.type='number';number.min=min;number.max=max;number.step=step;
 number.title='Type an exact value';number.setAttribute('aria-label',name+' numeric value');
 const reset=button('↺',()=>set(defaultValue),'reset');reset.title='Reset '+name+' to default';reset.setAttribute('aria-label','Reset '+name);
 const decimals=String(step).includes('.')?String(step).split('.')[1].length:0;
 const clamp=v=>Math.max(min,Math.min(max,Math.round(v/step)*step));
 function set(v){
   const parsed=Number(v);
   if(!Number.isFinite(parsed)){number.value=String(value);return;}
   value=clamp(parsed);
   const display=Number(value.toFixed(Math.min(decimals,6)));
   slider.value=String(display);number.value=String(display);
   onChange(display);
 }
 slider.value=String(value);number.value=String(value);
 slider.addEventListener('pointerdown',()=>{
   sliderDragging++;
   clearTimeout(settleTimer);
 });
 const finishDrag=()=>{
   if(sliderDragging>0)sliderDragging--;
   scheduleFinalize(90);
 };
 slider.addEventListener('pointerup',finishDrag);
 slider.addEventListener('pointercancel',finishDrag);
 slider.addEventListener('input',()=>set(slider.value));
 number.addEventListener('change',()=>set(number.value));
 number.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();number.blur();}});
 wrap.append(label,slider,number,reset);
 return wrap;
}
function renderProperties(){
 const root=$('layer-properties');root.replaceChildren();
 const layer=currentLayer();
 if(!layer){root.textContent='Select a layer';return;}
 normalizeLayerMasksIfMissing(layer);
 const index=()=>layers.indexOf(layer);
 let effect=layer.masks.find(e=>e.id===selectedMaskId)||layer.masks[0];
 if(effect)selectedMaskId=effect.id;
 function section(text){const el=document.createElement('div');el.className='section-label';el.textContent=text;root.append(el);}
 function row(name,element,onChange,event='input'){
   const wrap=document.createElement('div');wrap.className='row';
   const label=document.createElement('label');label.textContent=name;
   wrap.append(label,element);
   element.addEventListener(event,()=>{onChange(element.value);});
   root.append(wrap);
 }
 function textInput(name,field){
   const input=document.createElement('input');input.type='text';input.value=layer[field];
   row(name,input,v=>{layer[field]=v;mark(index(),field);renderLayers();},'change');
 }
 function colorInput(){
   const input=document.createElement('input');input.type='color';input.value=layer.color;
   row('Color',input,v=>{layer.color=v;mark(index(),'color');renderLayers();});
 }
 function slider(name,field,min,max,step,owner=layer,regenerate=true){
   const value=Number(owner[field]??PARAM_DEFAULTS[field]??0);
   const isMask=owner!==layer;
   const resetValue=isMask
     ?(GENERATOR_DEFAULTS[owner.mask]||{})[field]??(field==='angleThreshold'?(EDGE_ANGLE_TYPES.has(owner.mask)?20:180):PARAM_DEFAULTS[field]??1)
     :PARAM_DEFAULTS[field]??value;
   root.append(numericControl({name,value,min,max,step,defaultValue:resetValue,
     onChange:v=>{
       owner[field]=v;
       mark(index(),field,isMask?owner.id:null,regenerate);
     }}));
 }
 function dropdown(name,field,options,owner=layer,callback=null,regenerate=true){
   const el=document.createElement('select');
   for(const [text,value] of options){
     const opt=document.createElement('option');opt.textContent=text;opt.value=String(value);
     if(String(owner[field])===String(value))opt.selected=true;
     el.append(opt);
   }
   row(name,el,value=>{
     owner[field]=typeof owner[field]==='number'?Number(value)
       :typeof owner[field]==='boolean'?value==='true':value;
     if(callback)callback();
     mark(index(),field,owner===layer?null:owner.id,regenerate);
   },'change');
 }
 section('Material');
 textInput('Name','name');colorInput();
 slider('Roughness','roughness',0,1,.01);
 slider('Metallic','metallic',0,1,.01);
 slider('Relief height','height',-.45,.45,.005);
 slider('Opacity','opacity',0,1,.01);
 section('Projection & detail');
 const imageRow=document.createElement('div');imageRow.className='property-actions';
 imageRow.append(button(layer.imageData?'Replace image':'Load image',()=>{imageTarget=layer.id;imageFile.click();}),
   button('Clear image',()=>{layer.imageData=null;gpu.setLayerImage(layer).then(()=>mark(index()));renderProperties();}));
 root.append(imageRow);
 dropdown('Projection','projection',[['Triplanar','triplanar'],['UV','uv']]);
 slider('Pattern scale','scale',.1,20,.1);
 slider('Variation','variation',0,1,.01);
 section('Smart mask stack');
 const addRow=document.createElement('div');addRow.className='mask-add-row';
 const addSelect=document.createElement('select');addSelect.id='mask-add-type';
 addSelect.setAttribute('aria-label','Add smart mask generator');
 for(const [name,value] of masks){
   const option=document.createElement('option');option.value=String(value);option.textContent=name;
   if(value===1)option.selected=true;
   addSelect.append(option);
 }
 const add=button('＋ Mask',()=>{
   const created=createMaskEntry(Number(addSelect.value));
   layer.masks.push(created);selectedMaskId=created.id;
   mark(index(),null,created.id);renderProperties();renderLayers();
 });
 add.id='btn-add-smart-mask';addRow.append(addSelect,add);root.append(addRow);
 const list=document.createElement('div');list.className='mask-stack';
 for(let i=0;i<layer.masks.length;i++){
   const mask=layer.masks[i];
   const item=document.createElement('div');
   item.className='mask-stack-item'+(mask.id===selectedMaskId?' selected':'');
   const toggle=button(mask.enabled===false?'○':'◉',e=>{
     e.stopPropagation();mask.enabled=mask.enabled===false;
     mark(index(),null,mask.id,false);renderProperties();
   });toggle.title='Enable or disable mask';
   const label=button((i+1)+'. '+(masks.find(m=>m[1]===mask.mask)?.[0]||'Mask'),()=>{
     selectedMaskId=mask.id;renderProperties();
   });label.className='mask-name';
   item.append(toggle,label);list.append(item);
 }
 root.append(list);
 if(effect){
   const actions=document.createElement('div');actions.className='property-actions';
   const at=layer.masks.indexOf(effect);
   actions.append(
     button('↑',()=>{if(at<1)return;[layer.masks[at-1],layer.masks[at]]=[layer.masks[at],layer.masks[at-1]];mark(index(),null,effect.id,false);renderProperties();}),
     button('↓',()=>{if(at>=layer.masks.length-1)return;[layer.masks[at+1],layer.masks[at]]=[layer.masks[at],layer.masks[at+1]];mark(index(),null,effect.id,false);renderProperties();}),
     button('− Remove',()=>{layer.masks.splice(at,1);selectedMaskId=layer.masks[Math.min(at,layer.masks.length-1)]?.id;
       mark(index(),null,null,false);renderProperties();renderLayers();})
   );root.append(actions);
   dropdown('Generator','mask',masks,effect,()=>{
     const id=effect.id,enabled=effect.enabled,combine=effect.combine,opacity=effect.opacity;
     Object.assign(effect,createMaskEntry(effect.mask));
     effect.id=id;effect.enabled=enabled;effect.combine=combine;effect.opacity=opacity;
     renderProperties();renderLayers();
   });
   const description=document.createElement('p');description.className='mask-description';
   description.textContent=maskDescription[effect.mask]||'';root.append(description);
   dropdown('Combine','combine',[
     ['Replace','replace'],['Multiply','multiply'],['Add','add'],
     ['Subtract','subtract'],['Max','max'],['Min','min']
   ],effect,null,false);
   slider('Mask opacity','opacity',0,1,.01,effect,false);
   // Edge types use minimum geometric dihedral angle. Other generators
   // use maximum surface tilt measured from world up (180° = unrestricted).
   slider('Angle threshold','angleThreshold',0,180,1,effect);
   const angleHelp=document.createElement('p');angleHelp.className='property-help';
   angleHelp.textContent=EDGE_ANGLE_TYPES.has(effect.mask)
     ?'Minimum face-to-face angle for real convex/concave geometry. UV seams and coplanar edges are ignored.'
     :'Maximum permitted surface angle from upward. 180° means unrestricted.';
   root.append(angleHelp);
   if(effect.mask!==0){
     slider('Mask scale','scale',.1,20,.1,effect);
     slider('Noise seed','seed',0,999,1,effect);
     slider('Contrast','contrast',.2,8,.05,effect);
     if([1,2,3,4,5,6,7,10,11,13].includes(effect.mask)){
       slider(effect.mask===1?'Breakup intensity':'Grunge intensity','breakup',0,1,.01,effect);
       slider('Breakup hardness','breakupHardness',0,1,.01,effect);
       slider('Grunge scale','breakupScale',.2,8,.1,effect);
       if(effect.mask===1){
         slider('Breakup position','breakupPosition',0,1,.01,effect);
         slider('Breakup band width','breakupWidth',.01,2,.01,effect);
         const bandHelp=document.createElement('p');bandHelp.className='property-help';
         bandHelp.textContent='Position 0 = unworn surface, 1 = physical edge. Set Position to 1 to chip right into the 100% worn edge core. Band width up to 2 can cover the full edge-to-surface transition; existing defaults keep the core intact.';
         root.append(bandHelp);
       }
     }
     if([1,2,10,9,11].includes(effect.mask)){
       slider('Edge distance','edgeDistance',.002,.3,.001,effect);
       slider('Edge softness','softness',.01,.95,.01,effect);
     }
     if(effect.mask===1)slider('AO protection','aoProtect',0,1,.01,effect);
     if([8,9,10,12].includes(effect.mask)){
       slider('Density','density',0,1,.01,effect);
       slider('Length','length',.05,4,.01,effect);
       slider('Line width','width',.004,.4,.002,effect);
     }
     if(effect.mask===13){
       dropdown('Curvature region','meanCurvatureRegion',[
         ['Convex',0],['Concave',1],['Both',2],['Signed (grey = flat)',3]
       ],effect);
       slider('Curvature smoothing','meanCurvatureSmoothing',0,1,.01,effect);
       slider('Curvature cutoff','meanCurvatureCutoff',0,.95,.01,effect);
       slider('Curvature intensity','meanCurvatureIntensity',.1,8,.1,effect);
     }
     if(effect.mask===12)slider('Scratch angle','direction',-180,180,1,effect);
     if([8,9,10].includes(effect.mask))slider('Gravity','gravity',0,1,.01,effect);
     if([9,10,11].includes(effect.mask))slider('Cavity influence','cavity',0,1,.01,effect);
     if(effect.mask===11)slider('Top bias','topBias',0,1,.01,effect);
     dropdown('Invert','maskInvert',[['Normal',false],['Inverted',true]],effect);
   }
 }else{
   const empty=document.createElement('p');empty.className='mask-description';
   empty.textContent='No smart masks: this material fills the entire surface. Add a mask to limit its coverage.';
   root.append(empty);
 }
 const hint=document.createElement('p');hint.className='property-help';
 hint.textContent='Mask effects combine in listed order, then the painted mask is applied. Each generator has independent settings and can be reordered.';
 root.append(hint);
 section('Brush');
 const maskActions=document.createElement('div');maskActions.className='property-actions';
 maskActions.append(button('Clear mask',()=>{gpu.fillMask(layer,0);mark(index(),null,null,false);}),
   button('Fill mask',()=>{gpu.fillMask(layer,1);mark(index(),null,null,false);}));
 root.append(maskActions);
 for(const [name,key,min,max,step,get,set] of [
   ['Radius','brushRadius',.015,.6,.005,()=>brushRadius,v=>brushRadius=v],
   ['Hardness','brushHardness',.01,.99,.01,()=>brushHardness,v=>brushHardness=v],
   ['Strength','brushStrength',.05,1,.01,()=>brushStrength,v=>brushStrength=v]
 ]){
   root.append(numericControl({name,value:get(),min,max,step,defaultValue:BRUSH_DEFAULTS[key],onChange:set}));
 }
}
function normalizeLayerMasksIfMissing(layer){
 if(!Array.isArray(layer.masks))normalizeLayerMasks(layer,true);
}
function addLayer(template={}){
  const layer=newLayer(template);
  const i=layers.findIndex(l=>l.id===selected);
  layers.splice(i+1,0,layer);selected=layer.id;selectedMaskId=layer.masks[0]?.id;
  mark(Math.max(0,i+1));renderLayers();renderProperties();
}
function moveLayer(amount){
  const i=layers.findIndex(l=>l.id===selected),dest=i+amount;
  if(i<0||dest<0||dest>=layers.length)return;
  const [layer]=layers.splice(i,1);layers.splice(dest,0,layer);
  mark(Math.min(i,dest));renderLayers();
}
$('btn-add-layer').onclick=()=>addLayer(presets[Number($('new-layer-preset').value)]||presets[4]);
$('btn-remove-layer').onclick=()=>{
  if(layers.length<=1){status('At least one layer is required');return;}
  const i=layers.findIndex(l=>l.id===selected);
  if(i<0)return;
  layers.splice(i,1);selected=layers[Math.min(i,layers.length-1)].id;selectedMaskId=currentLayer()?.masks?.[0]?.id;
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
$('ray-distance').oninput=e=>{$('ray-distance-number').value=Number(e.target.value).toFixed(2);};
$('ray-distance-number').onchange=e=>{
 const n=Number(e.target.value);
 const value=Number.isFinite(n)?Math.max(.03,Math.min(1.5,n)):.35;
 $('ray-distance').value=value;
 e.target.value=value.toFixed(2);
};
$('ray-distance-reset').onclick=()=>{
 $('ray-distance').value='.35';
 $('ray-distance-number').value='.35';
};
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
    if(result.uvOverlap>.025){
      const percent=Math.round(result.uvOverlap*100);
      $('mesh-info').textContent+=' · UV overlaps '+percent+'%';
      status('⚠ Overlapping UVs detected. Geometry-driven baked masks may be incorrect; unwrap the mesh UVs.');
    }
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
    nextMaskId=Math.max(nextMaskId,...layers.flatMap(l=>l.masks.map(m=>Number(m.id.split('-').at(-1))||0)))+1;
    nextId=Math.max(nextId,...layers.map(l=>Number(l.id.split('-').at(-1))||0))+1;
    selected=layers.at(-1)?.id;selectedMaskId=layers.at(-1)?.masks?.[0]?.id;
    gpu.layers=layers;
    gpu.clearLayerImages();
    for(const layer of layers)if(layer.imageData)await gpu.setLayerImage(layer);
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
if(new URLSearchParams(location.search).get('smoke')==='1'){
  $('resolution').value='256';
  $('samples').value='8';
}
function createValidationCube(){
 const geometry=new THREE.BoxGeometry(1,1,1).toNonIndexed();
 // Unique 3x2 face atlas. BoxGeometry's overlapping face UVs invalidate geometry-map baking!
 const uv=geometry.getAttribute('uv');
 for(let face=0;face<6;face++){
  for(let i=face*6;i<face*6+6;i++){
   const x=face%3,y=Math.floor(face/3);
   uv.setXY(i,(x+.06+uv.getX(i)*.88)/3,(y+.06+uv.getY(i)*.88)/2);
  }
 }
 uv.needsUpdate=true;
 return prepareScene(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),'Smoke UV-unwrapped cube');
}
gpu.setGeometry(new URLSearchParams(location.search).get('smoke')==='1'
  ? createValidationCube()
  : createDemoMesh());
$('mesh-info').textContent=gpu.model.name+' · '+gpu.model.triangleCount.toLocaleString()+' tris';
bake();
