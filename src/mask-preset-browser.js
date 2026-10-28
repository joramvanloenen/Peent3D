import {
 BUILTIN_MASK_PRESETS,MASK_PRESET_CATEGORIES,loadUserMaskPresets,writeUserMaskPresets,
 captureMaskPreset,instantiateMaskPreset
} from './mask-presets.js';

const $el=(tag,cls='',text='')=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text)el.textContent=text;
 return el;
};
const clamp=x=>Math.max(0,Math.min(1,x));
const hash=(x,y,seed=0)=>{
 let k=(Math.imul((x*1301+y*2729+seed*659)|0,374761393)^668265263)|0;
 k=Math.imul(k^(k>>>13),1274126177);
 return ((k^(k>>>16))>>>0)/4294967295;
};
function noise(x,y,seed=0){
 const ax=Math.floor(x),ay=Math.floor(y),sx=x-ax,sy=y-ay;
 const u=sx*sx*(3-2*sx),v=sy*sy*(3-2*sy);
 const a=hash(ax,ay,seed),b=hash(ax+1,ay,seed);
 const c=hash(ax,ay+1,seed),d=hash(ax+1,ay+1,seed);
 return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
const smooth=(low,high,x)=>{const t=clamp((x-low)/Math.max(.00001,high-low));return t*t*(3-2*t);};
function sampleMask(e,x,y){
 const seed=Math.floor(e.seed||0),scale=Math.max(.35,e.scale||3);
 const n=noise(x*scale*7,y*scale*7,seed);
 const gn=noise(x*scale*3+9,y*scale*3+13,seed);
 const outer=Math.min(x,1-x,y,1-y);
 const bevel=1-smooth(.01,Math.max(.05,(e.edgeDistance||.04)*3),outer);
 const convex=bevel*smooth((e.angleThreshold||20)/160,(e.angleThreshold||20)/160+.35,.73);
 const line=Math.abs(Math.sin((x+Math.sin(y*27)*.01)*scale*34));
 const streak=(1-smooth(.0,Math.max(.02,(e.width||.05)*8),line))*
   smooth(.18,.32,y)*(1-smooth(.6,1,y));
 let v=1;
 switch(e.mask){
  case 0:v=1;break;
  case 1:v=convex* (.68+.32*n);break;
  case 2:v=(1-smooth(.01,.095,Math.abs(x-.48)))*(.4+.5*gn);break;
  case 3:v=1-smooth(.04,.23,outer);break;
  case 4:v=1-y;break;
  case 5:v=y;break;
  case 6:v=(1-smooth(.2,.72,Math.abs(x-.5)))*.5;break;
  case 7:v=gn;break;
  case 8:v=streak;break;
  case 9:v=streak*.75*(.4+.6*gn);break;
  case 10:v=smooth(.44,.72,gn*.5+n*.5)*(.7+.3*y)+streak*.28;break;
  case 11:v=clamp(1-y)*(.65+.35*gn);break;
  case 12:v=(1-smooth(.97,1,Math.sin(x*scale*54+y*14)))*
    smooth(.39,.8,hash(Math.floor(x*scale*12),Math.floor(y*scale*12),seed));break;
  case 13:v=smooth(.11,.8,bevel)*(e.meanCurvatureRegion===1?.4:1);break;
 }
 const contrast=Number.isFinite(e.contrast)?e.contrast:1;
 v=clamp((v-.5)*contrast+.5);
 const breakup=e.breakup||0;
 if(breakup>0)v*=1-breakup*clamp(1-n);
 if(e.maskInvert)v=1-v;
 return clamp(v);
}
function compositePreview(masks,x,y){
 let value=1;
 let first=true;
 for(const e of masks){
   if(e.enabled===false)continue;
   const v=sampleMask(e,x,y),a=clamp(e.opacity??1);
   if(first){value=v*a;first=false;continue;}
   switch(e.combine){
    case 'replace':value=value*(1-a)+v*a;break;
    case 'add':value=Math.min(1,value+v*a);break;
    case 'subtract':value=value*(1-v*a);break;
    case 'max':value=Math.max(value,v*a);break;
    case 'min':value=Math.min(value,1-(1-v)*a);break;
    default:value=value*(1-a+a*v);break;
   }
 }
 return first?1:value;
}
const previewCache=new Map();
export function renderPresetThumbnail(canvas,preset){
 const key=preset.id+JSON.stringify(preset.masks);
 if(previewCache.has(key)){const image=previewCache.get(key);canvas.getContext('2d').putImageData(image,0,0);return;}
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
 const img=ctx.createImageData(w,h);
 for(let iy=0;iy<h;iy++)for(let ix=0;ix<w;ix++){
   const u=(ix+.5)/w,v=(iy+.5)/h;
   const dx=Math.abs(u-.5)/.43,dy=Math.abs(v-.5)/.44;
   const shape=Math.max(dx,dy);
   const outside=shape>1;
   const x=clamp((u-.075)/.85),y=clamp((v-.075)/.85);
   const mask=outside?0:compositePreview(preset.masks,x,y);
   const pixel=(iy*w+ix)*4;
   const base=outside?26:37;
   const light=outside?0:Math.floor(mask*207);
   img.data[pixel]=base+light;img.data[pixel+1]=base+light;
   img.data[pixel+2]=base+light;img.data[pixel+3]=255;
   if(!outside&&shape>.972){
     img.data[pixel]=215;img.data[pixel+1]=134;img.data[pixel+2]=80;
   }
 }
 ctx.putImageData(img,0,0);
 if(previewCache.size>80)previewCache.clear();
 previewCache.set(key,img);
}
export function createMaskPresetBrowser({getLayer,getSelectedMaskId,makeEffect,onApply,onStatus}){
 let users=loadUserMaskPresets(window.localStorage);
 let chosenId='wear-fine',category='All',query='',saveMode=false;
 const overlay=$el('div','preset-overlay');
 overlay.id='mask-preset-browser';overlay.hidden=true;
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Smart mask preset browser');
 const dialog=$el('div','preset-dialog');
 const head=$el('div','preset-header');
 const heading=$el('div','preset-heading');
 heading.append($el('div','preset-eyebrow','PEENT3D / LIBRARY'),$el('h2','','Smart mask presets'),
   $el('div','preset-subtitle','Curated procedural looks and multi-mask recipes'));
 const close=$el('button','preset-close','×');close.title='Close preset browser';close.setAttribute('aria-label','Close preset browser');
 head.append(heading,close);dialog.append(head);
 const toolbar=$el('div','preset-toolbar');
 const search=$el('input','preset-search');
 search.type='search';search.placeholder='Search masks, effects, tags…';
 search.id='mask-preset-search';search.setAttribute('aria-label','Search smart mask presets');
 const save=$el('button','preset-save-trigger','＋ Save current masks');
 toolbar.append(search,save);dialog.append(toolbar);
 const saveForm=$el('div','preset-save-form');saveForm.hidden=true;
 const name=$el('input','preset-name');name.id='mask-preset-name';name.placeholder='Preset name';
 name.maxLength=70;name.setAttribute('aria-label','New mask preset name');
 const saveSelected=$el('button','','Save selected mask');saveSelected.id='mask-preset-save-selected';
 const saveStack=$el('button','primary','Save entire stack');saveStack.id='mask-preset-save-stack';
 const cancelSave=$el('button','','Cancel');
 saveForm.append(name,saveSelected,saveStack,cancelSave);dialog.append(saveForm);
 const categories=$el('div','preset-categories');dialog.append(categories);
 const body=$el('div','preset-body');
 const grid=$el('div','preset-grid');grid.id='mask-preset-grid';
 const detail=$el('aside','preset-detail');detail.id='mask-preset-detail';
 body.append(grid,detail);dialog.append(body);
 const footer=$el('div','preset-footer');
 footer.append($el('span','','Thumbnails are illustrative; the live mask responds to your mesh and bake settings.'));
 const count=$el('span','preset-count');
 footer.append(count);dialog.append(footer);
 overlay.append(dialog);document.body.append(overlay);
 let previousFocus=null;
 function presets(){return [...BUILTIN_MASK_PRESETS,...users];}
 function current(){return presets().find(x=>x.id===chosenId);}
 function closeBrowser(){
   overlay.hidden=true;saveForm.hidden=true;saveMode=false;
   if(previousFocus?.isConnected)previousFocus.focus();
 }
 function openBrowser(){
   previousFocus=document.activeElement;
   if(!getLayer()){onStatus('Select a material layer to apply a smart-mask preset.');return;}
   overlay.hidden=false;render();search.focus();
 }
 close.addEventListener('click',closeBrowser);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeBrowser();});
 overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeBrowser();}
   if(e.key==='Tab'){
     const elements=[...dialog.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el=>!el.closest('[hidden]'));
     if(!elements.length)return;
     if(e.shiftKey&&document.activeElement===elements[0]){e.preventDefault();elements.at(-1).focus();}
     else if(!e.shiftKey&&document.activeElement===elements.at(-1)){e.preventDefault();elements[0].focus();}
   }
 });
 search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();render();});
 save.addEventListener('click',()=>{
   saveMode=!saveMode;saveForm.hidden=!saveMode;
   if(saveMode)name.focus();
 });
 cancelSave.addEventListener('click',()=>{saveMode=false;saveForm.hidden=true;});
 function persist(masks){
   try{
     const preset=captureMaskPreset(name.value,masks);
     users=writeUserMaskPresets(window.localStorage,[...users,preset]);
     chosenId=preset.id;category='My presets';query='';search.value='';
     saveMode=false;saveForm.hidden=true;name.value='';
     onStatus('Saved mask preset: '+preset.name);
     render();
   }catch(error){onStatus(error.message);}
 }
 saveSelected.addEventListener('click',()=>{
   const layer=getLayer();if(!layer?.masks?.length)return;
   const selected=layer.masks.find(x=>x.id===getSelectedMaskId())||layer.masks.at(-1);
   persist([selected]);
 });
 saveStack.addEventListener('click',()=>{
   const layer=getLayer();if(!layer?.masks?.length)return;
   persist(layer.masks);
 });
 function render(){
   const all=presets();
   if(!all.some(x=>x.id===chosenId))chosenId=all[0]?.id;
   categories.replaceChildren();
   for(const entry of MASK_PRESET_CATEGORIES){
     const n=entry==='All'?all.length:all.filter(x=>x.category===entry).length;
     const tab=$el('button','preset-category'+(category===entry?' selected':''),entry+' · '+n);
     tab.setAttribute('aria-pressed',String(category===entry));
     tab.addEventListener('click',()=>{category=entry;render();});
     categories.append(tab);
   }
   const shown=all.filter(p=>(category==='All'||p.category===category)
     &&(!query||[p.name,p.description,p.category,...(p.tags||[])].join(' ').toLowerCase().includes(query)));
   grid.replaceChildren();
   if(!shown.length)grid.append($el('div','preset-empty','No presets found. Try another search or category.'));
   for(const preset of shown){
     const card=$el('button','preset-card'+(chosenId===preset.id?' selected':''));
     card.setAttribute('aria-pressed',String(chosenId===preset.id));
     card.title=preset.description;
     const thumb=$el('canvas','preset-thumb');thumb.width=120;thumb.height=88;
     renderPresetThumbnail(thumb,preset);
     const data=$el('div','preset-card-copy');
     data.append($el('strong','',preset.name),
       $el('small','',preset.masks.length+' mask'+(preset.masks.length===1?'':'s')+' · '+preset.category));
     card.append(thumb,data);
     card.addEventListener('click',()=>{chosenId=preset.id;render();});
     card.addEventListener('dblclick',()=>applyPreset('append'));
     grid.append(card);
   }
   count.textContent=shown.length+' of '+all.length+' presets';
   renderDetail();
 }
 function applyPreset(mode){
   const preset=current(),layer=getLayer();
   if(!preset||!layer)return;
   try{
     const effects=instantiateMaskPreset(preset,makeEffect);
     // Adding a recipe should never silently clear earlier smart masks.
     if(mode==='append'&&layer.masks?.length&&effects.length)effects[0].combine='multiply';
     onApply(layer,effects,mode,preset);
     closeBrowser();
   }catch(error){onStatus(error.message);}
 }
 function renderDetail(){
   detail.replaceChildren();
   const preset=current();
   if(!preset)return;
   detail.append($el('div','preset-detail-heading',preset.category.toUpperCase()),
     $el('h3','',preset.name));
   const thumb=$el('canvas','preset-detail-thumb');thumb.width=120;thumb.height=88;
   renderPresetThumbnail(thumb,preset);
   detail.append(thumb,$el('p','',preset.description),
     $el('div','preset-detail-label','MASK RECIPE'));
   const stack=$el('div','preset-recipe');
   for(let i=0;i<preset.masks.length;i++){
     const e=preset.masks[i];
     const type=['Full surface','Convex edge wear','Concave edge','AO cavity','Height top',
      'Height bottom','Thickness','Organic grunge','Streaks','Leaks','Rust',
      'Dust','Scratches','Signed mean curvature'][e.mask]||'Smart mask';
     stack.append($el('div','preset-recipe-row',
       (i+1)+'. '+type+(i>0?' · '+(e.combine||'multiply'):'')+(e.opacity<1?' · '+Math.round(e.opacity*100)+'%':'')));
   }
   detail.append(stack);
   const buttons=$el('div','preset-apply-buttons');
   const add=$el('button','primary','＋ Add to stack');add.id='mask-preset-add';add.addEventListener('click',()=>applyPreset('append'));
   const replace=$el('button','','Replace stack');replace.id='mask-preset-replace';
   replace.title='Replace procedural smart masks; material color and painted mask remain unchanged';
   replace.addEventListener('click',()=>applyPreset('replace'));
   buttons.append(add,replace);detail.append(buttons);
   detail.append($el('div','preset-detail-hint','Applies to the selected material layer. Every resulting mask remains editable.'));
   if(preset.custom){
     const del=$el('button','preset-delete','Delete saved preset');
     del.id='mask-preset-delete';
     del.addEventListener('click',()=>{
       try{
         users=writeUserMaskPresets(window.localStorage,users.filter(x=>x.id!==preset.id));
         chosenId=users[0]?.id||BUILTIN_MASK_PRESETS[0].id;
         onStatus('Deleted custom mask preset: '+preset.name);
         render();
       }catch(error){onStatus(error.message);}
     });
     detail.append(del);
   }
 }
 return {open:openBrowser,close:closeBrowser,refresh:render};
}
