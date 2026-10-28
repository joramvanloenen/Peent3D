import {
 MATERIAL_LIBRARY_KEY,MATERIAL_CATEGORIES,createMaterialRecipe,instantiateMaterialRecipe,
 parseMaterialLibrary,encodeMaterialLibrary,starterMaterialRecipes
} from './material-library.js';

const el=(tag,cls='',txt='')=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(txt)node.textContent=txt;
 return node;
};
const clamp=x=>Math.max(0,Math.min(1,x));
const rgb=(hex)=>{
 const x=parseInt(hex.slice(1),16);
 return [(x>>16)&255,(x>>8)&255,x&255];
};
const thumbnailCache=new Map();
function renderMaterialThumbnail(canvas,material){
 const key=material.id+JSON.stringify(material.layers.map(l=>[l.color,l.roughness,l.metallic,l.opacity,l.visible,l.masks?.map(m=>m.mask)]));
 if(thumbnailCache.has(key)){
   canvas.getContext('2d').putImageData(thumbnailCache.get(key),0,0);
   return;
 }
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
 const image=ctx.createImageData(w,h),lights=[-.52,-.62,.58],L=Math.hypot(...lights);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const index=(y*w+x)*4;
   const u=(x+.5-w*.5)/(w*.32),v=(y+.5-h*.5)/(h*.41);
   const radius=u*u+v*v;
   let pixels=[25,25,25];
   if(radius<=1){
     const n=[u,-v,Math.sqrt(1-radius)];
     const light=Math.max(0,(n[0]*lights[0]+n[1]*lights[1]+n[2]*lights[2])/L);
     let color=[110,110,110],rough=.58,metal=0;
     for(const layer of material.layers){
       if(layer.visible===false)continue;
       const a=clamp(layer.opacity??1),c=rgb(layer.color);
       color=color.map((base,i)=>base*(1-a)+c[i]*a);
       rough=rough*(1-a)+clamp(layer.roughness??.6)*a;
       metal=metal*(1-a)+clamp(layer.metallic??0)*a;
     }
     const diffuse=.21+.8*light;
     const highlight=Math.pow(Math.max(0,(n[0]*-.4+n[1]*-.4+n[2]*.82)),6+rough*110);
     pixels=color.map(c=>clamp((c*diffuse+highlight*(1-rough)*205*(.3+.7*metal))/255)*255);
     const rim=clamp((Math.sqrt(radius)-.7)*2.6);
     pixels=pixels.map(c=>c*(1-rim*.17));
   }
   image.data[index]=pixels[0];image.data[index+1]=pixels[1];
   image.data[index+2]=pixels[2];image.data[index+3]=255;
 }
 ctx.putImageData(image,0,0);
 if(thumbnailCache.size>128)thumbnailCache.clear();
 thumbnailCache.set(key,image);
}
export function createMaterialBrowser({starterLayers,getLayers,getSelectedLayer,makeLayer,onApply,onStatus}){
 let stored=[],selected=null,filter='All',query='';
 let storageBusy=false;
 const overlay=el('div','material-browser-overlay');
 overlay.id='material-browser';overlay.hidden=true;
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Material browser');
 const panel=el('div','material-browser-dialog');
 const head=el('div','material-browser-header');
 const title=el('div');
 title.append(el('small','material-eyebrow','PEENT3D / MATERIAL LIBRARY'),
   el('h2','','Materials'),el('p','','Save a complete material, then reuse it on any mesh.'));
 const close=el('button','material-browser-close','×');close.setAttribute('aria-label','Close material browser');
 head.append(title,close);panel.append(head);
 const toolbar=el('div','material-browser-toolbar');
 const search=el('input','material-browser-search');
 search.type='search';search.placeholder='Search saved materials…';search.id='material-browser-search';
 const save=el('button','material-browser-save','＋ Save material');
 save.id='btn-save-material';toolbar.append(search,save);panel.append(toolbar);
 const form=el('div','material-browser-save-form');form.hidden=true;
 const name=el('input');name.id='material-save-name';name.maxLength=75;name.placeholder='Material name';
 const saveSelected=el('button','','Save selected layer');saveSelected.id='material-save-selected';
 const saveStack=el('button','primary','Save entire stack');saveStack.id='material-save-stack';
 const cancel=el('button','','Cancel');
 form.append(name,saveSelected,saveStack,cancel);panel.append(form);
 const categories=el('div','material-browser-categories');panel.append(categories);
 const body=el('div','material-browser-body');
 const grid=el('div','material-browser-grid');grid.id='material-browser-grid';
 const sidebar=el('aside','material-browser-details');sidebar.id='material-browser-details';
 body.append(grid,sidebar);panel.append(body);
 const footer=el('div','material-browser-footer');
 const note=el('span','','Saved materials keep editable masks and image fills. Painted UV masks remain in projects.');
 const count=el('span');footer.append(note,count);panel.append(footer);
 overlay.append(panel);document.body.append(overlay);
 let priorFocus=null;
 const builtin=starterMaterialRecipes(starterLayers);
 const all=()=>[...builtin,...stored];
 let saving=false;
 async function load(){
   try{
     let raw;
     if(window.peentDesktop?.readMaterialLibrary){
       const response=await window.peentDesktop.readMaterialLibrary();
       if(response.error)throw Error(response.error);
       raw=response.raw;
     }else raw=window.localStorage.getItem(MATERIAL_LIBRARY_KEY);
     stored=parseMaterialLibrary(raw);
   }catch(error){onStatus('Material library unavailable: '+error.message);}
   render();
 }
 async function persist(updated){
   if(storageBusy)throw Error('A material library update is already in progress.');
   storageBusy=true;
   saveSelected.disabled=true;saveStack.disabled=true;
   try{
     const raw=encodeMaterialLibrary(updated);
     if(window.peentDesktop?.writeMaterialLibrary){
       const response=await window.peentDesktop.writeMaterialLibrary(raw);
       if(response.error)throw Error(response.error);
     }else window.localStorage.setItem(MATERIAL_LIBRARY_KEY,raw);
     stored=updated;
     render();
   }finally{
     storageBusy=false;saveSelected.disabled=false;saveStack.disabled=false;
   }
 }
 function open(){
   priorFocus=document.activeElement;
   overlay.hidden=false;render();search.focus();
 }
 function hide(){
   overlay.hidden=true;form.hidden=true;saving=false;
   if(priorFocus?.isConnected)priorFocus.focus();
 }
 close.onclick=hide;
 overlay.addEventListener('click',e=>{if(e.target===overlay)hide();});
 overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();hide();}
   if(e.key==='Tab'){
     const focusables=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled])')]
       .filter(x=>!x.closest('[hidden]'));
     if(e.shiftKey&&document.activeElement===focusables[0]){e.preventDefault();focusables.at(-1).focus();}
     else if(!e.shiftKey&&document.activeElement===focusables.at(-1)){e.preventDefault();focusables[0].focus();}
   }
 });
 search.addEventListener('input',()=>{query=search.value.toLowerCase().trim();render();});
 save.onclick=()=>{saving=!saving;form.hidden=!saving;name.value=getSelectedLayer()?.name||'';
   if(saving)name.focus();};
 cancel.onclick=()=>{saving=false;form.hidden=true;};
 async function store(recipeLayers){
   try{
     const recipe=createMaterialRecipe(name.value,recipeLayers);
     const next=[...stored,recipe];
     await persist(next);
     selected=recipe.id;filter='My materials';query='';search.value='';
     saving=false;form.hidden=true;
     onStatus('Material saved to library: '+recipe.name);
     render();
   }catch(error){onStatus('Could not save material: '+error.message);}
 }
 saveSelected.onclick=()=>{const layer=getSelectedLayer();if(layer)void store([layer]);};
 saveStack.onclick=()=>{const layers=getLayers();if(layers?.length)void store(layers);};
 async function apply(mode){
   const recipe=all().find(x=>x.id===selected);
   if(!recipe)return;
   try{
     const layers=instantiateMaterialRecipe(recipe,makeLayer);
     await onApply(layers,mode,recipe);
     hide();
   }catch(error){onStatus('Cannot apply material: '+error.message);}
 }
 function render(){
   const entries=all();
   categories.replaceChildren();
   for(const category of MATERIAL_CATEGORIES){
     const n=category==='All'?entries.length:entries.filter(x=>x.category===category).length;
     const btn=el('button','material-category'+(category===filter?' selected':''),category+' · '+n);
     btn.setAttribute('aria-pressed',String(category===filter));
     btn.onclick=()=>{filter=category;render();};categories.append(btn);
   }
   const found=entries.filter(x=>(filter==='All'||x.category===filter)&&
     (!query||(x.name+' '+x.description+' '+x.category).toLowerCase().includes(query)));
   if(found.length&&!found.some(x=>x.id===selected))selected=found[0].id;
   grid.replaceChildren();
   for(const recipe of found){
     const card=el('button','material-card'+(selected===recipe.id?' selected':''));
     card.setAttribute('aria-pressed',String(selected===recipe.id));
     const canvas=el('canvas','material-card-thumbnail');canvas.width=144;canvas.height=112;
     renderMaterialThumbnail(canvas,recipe);
     const labels=el('div','material-card-copy');
     labels.append(el('strong','',recipe.name),
       el('small','',recipe.layers.length+' layer'+(recipe.layers.length===1?'':'s')+' · '+recipe.category));
     card.append(canvas,labels);
     card.onclick=()=>{selected=recipe.id;render();};
     card.ondblclick=()=>apply('replace');
     grid.append(card);
   }
   if(!found.length)grid.append(el('p','material-empty','No materials found. Save one to get started.'));
   count.textContent=found.length+' of '+entries.length+' materials';
   renderDetails();
 }
 function renderDetails(){
   sidebar.replaceChildren();
   const recipe=all().find(x=>x.id===selected);
   if(!recipe)return;
   sidebar.append(el('span','material-detail-category',recipe.category.toUpperCase()),
     el('h3','',recipe.name));
   const large=el('canvas','material-detail-thumbnail');large.width=144;large.height=112;
   renderMaterialThumbnail(large,recipe);
   sidebar.append(large,el('p','',recipe.description||'Reusable editable material'));
   const items=el('div','material-detail-layers');
   for(const layer of recipe.layers){
     const row=el('div','material-detail-layer');
     const swatch=el('span','material-detail-swatch');swatch.style.background=layer.color;
     row.append(swatch,el('span','',layer.name+' · '+layer.masks.length+' mask'+(layer.masks.length===1?'':'s')));
     items.append(row);
   }
   sidebar.append(el('small','material-detail-heading','LAYERS & SMART MASKS'),items);
   const buttons=el('div','material-browser-actions');
   const replace=el('button','primary','Use material (replace stack)');
   replace.id='material-apply-replace';replace.onclick=()=>apply('replace');
   const add=el('button','','＋ Add material layers');
   add.id='material-apply-add';add.onclick=()=>apply('append');
   buttons.append(replace,add);sidebar.append(buttons);
   sidebar.append(el('small','material-browser-hint','Applies editable layers to this mesh. Mesh maps are reused; no rebake required.'));
   if(!recipe.builtin){
     const del=el('button','material-delete','Delete saved material');del.id='material-delete';
     del.onclick=async()=>{
       if(storageBusy)return;
       del.disabled=true;
       try{
         await persist(stored.filter(x=>x.id!==recipe.id));
         selected=null;render();onStatus('Deleted material: '+recipe.name);
       }catch(error){onStatus(error.message);}
     };
     sidebar.append(del);
   }
 }
 load();
 return {open,refresh:render,reload:load};
}
