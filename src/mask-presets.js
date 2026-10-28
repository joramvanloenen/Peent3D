// Curated mask recipes are independent of materials and use the same effect
// representation as the existing per-material smart-mask stack.
export const PRESET_STORAGE_KEY='peent3d.smart-mask-presets.v1';
export const MASK_PRESET_CATEGORIES=['All','Wear','Weathering','Dirt','Surface','Curvature','My presets'];
const fx=(mask,settings={},combine='multiply',opacity=1)=>({mask,combine,opacity,...settings});
const builtins=[
 {id:'wear-fine',name:'Fine Edge Abrasion',category:'Wear',description:'Tight convex edge abrasion with restrained breakup and clean sharp corners.',tags:['edges','metal','subtle'],masks:[fx(1,{edgeDistance:.018,angleThreshold:27,softness:.2,breakup:.24,breakupHardness:.8,breakupPosition:.73,breakupWidth:.35,aoProtect:.42,scale:5.5})]},
 {id:'wear-chipped',name:'Chipped Paint',category:'Wear',description:'Wide, visibly chipped edges, including damage all the way into the exposed edge core.',tags:['paint','damaged','edges'],masks:[fx(1,{edgeDistance:.068,angleThreshold:16,softness:.55,breakup:.86,breakupHardness:.78,breakupPosition:.88,breakupWidth:1.2,breakupScale:2.4,scale:4.6})]},
 {id:'wear-heavy',name:'Heavy Corner Wear',category:'Wear',description:'Broad worn corners with rough granular breakup and secondary fine edge abrasion.',tags:['corners','worn','aged'],masks:[fx(1,{edgeDistance:.095,angleThreshold:25,softness:.65,breakup:.65,breakupPosition:.85,breakupWidth:1.15,scale:3.1}),fx(1,{edgeDistance:.014,angleThreshold:36,softness:.15,breakup:.12,scale:7},'add',.55)]},
 {id:'wear-precision',name:'Machined Edge Highlights',category:'Wear',description:'Hard, precise convex edges with very little grunge, suitable for machined metal.',tags:['precision','metal','clean'],masks:[fx(1,{edgeDistance:.009,angleThreshold:39,softness:.1,breakup:.05,aoProtect:.12,scale:6})]},
 {id:'wear-exposed',name:'Exposed Metal + Scrapes',category:'Wear',description:'Combines worn exposed edges with directional surface scratches.',tags:['scratches','wear','hard surface'],masks:[fx(1,{edgeDistance:.048,breakup:.49,breakupPosition:.87,breakupWidth:.88,scale:3.4}),fx(12,{density:.19,length:1.2,width:.034,direction:17,scale:2.2,angleThreshold:180},'add',.5)]},
 {id:'weather-rust',name:'Oxidized Steel',category:'Weathering',description:'Patchy oxidation gathering in cavities with occasional rust runs.',tags:['rust','corrosion','oxidation'],masks:[fx(10,{cavity:.89,scale:2.6,breakup:.25,density:.28,length:1.4,width:.09}),fx(9,{angleThreshold:18,density:.32,length:2.3,width:.055,scale:1.4,cavity:.85},'add',.45)]},
 {id:'weather-drips',name:'Rain Streaks',category:'Weathering',description:'Long, thin gravity streaks on vertical surfaces with uneven spacing.',tags:['rain','streaks','vertical'],masks:[fx(8,{density:.52,length:2.9,width:.065,scale:1.35,contrast:1.3,angleThreshold:18})]},
 {id:'weather-leaks',name:'Panel Seam Leaks',category:'Weathering',description:'Localized runs from sheltered edges and seams, reinforced by concavity.',tags:['drips','leaks','seams'],masks:[fx(9,{angleThreshold:18,density:.42,length:2.7,width:.075,cavity:.7,scale:1.5,edgeDistance:.075})]},
 {id:'weather-aged',name:'Aged Painted Metal',category:'Weathering',description:'Weathered paint: chipped edges, oxidation in cavities and a little runoff.',tags:['paint','rust','aged'],masks:[fx(1,{edgeDistance:.062,breakup:.75,breakupPosition:.95,breakupWidth:1.4,scale:3.4}),fx(10,{cavity:.82,scale:3.5,breakup:.34},'add',.43),fx(8,{angleThreshold:18,density:.3,length:1.9,width:.045},'add',.2)]},
 {id:'weather-waterline',name:'Lower Water Damage',category:'Weathering',description:'Staining biased toward lower surfaces, broken up by organic grunge.',tags:['water','bottom','weather'],masks:[fx(5,{contrast:1.25,breakup:.31,scale:2.9}),fx(7,{scale:2.5,contrast:1.4},'multiply',.62)]},
 {id:'dirt-cavity',name:'Cavity Dirt',category:'Dirt',description:'Dark buildup in crevices, driven by baked AO.',tags:['dirt','crevice','ambient occlusion'],masks:[fx(3,{contrast:2.2,breakup:.18,breakupScale:2.2})]},
 {id:'dirt-dust',name:'Settled Dust',category:'Dirt',description:'Soft dust collecting on upward-facing and sheltered surfaces.',tags:['dust','top-facing','sheltered'],masks:[fx(11,{topBias:.88,cavity:.42,breakup:.17,scale:2.8})]},
 {id:'dirt-ground',name:'Ground Contact Grime',category:'Dirt',description:'Dirt gathering near the base and into recessed areas.',tags:['ground','base','dirt'],masks:[fx(5,{contrast:1.4,breakup:.28,scale:3}),fx(3,{contrast:1.4,breakup:.1},'add',.28)]},
 {id:'dirt-dust-dirt',name:'Dusty Crevices',category:'Dirt',description:'A mix of upward-facing dust and cavity buildup.',tags:['dust','crevice','grime'],masks:[fx(11,{topBias:.74,cavity:.43,scale:2}),fx(3,{contrast:1.8,breakup:.24},'add',.28)]},
 {id:'surface-scratches',name:'Fine Surface Scratches',category:'Surface',description:'Sparse hairline scratches with coherent direction and variable lengths.',tags:['scratches','hairline','fine'],masks:[fx(12,{density:.16,length:1.3,width:.025,direction:24,scale:2.3})]},
 {id:'surface-scuffs',name:'Rough Scuffs',category:'Surface',description:'Denser abrasive marks and patches, suited to worn painted surfaces.',tags:['scrapes','scuff','abrasion'],masks:[fx(12,{density:.34,length:.65,width:.052,direction:36,scale:2.6}),fx(7,{contrast:2.4,scale:4.2},'multiply',.42)]},
 {id:'surface-grunge',name:'Organic Grunge',category:'Surface',description:'Broad natural variation and irregular mottled breakup.',tags:['noise','organic','variation'],masks:[fx(7,{scale:1.7,contrast:2.1,breakup:0})]},
 {id:'surface-pitting',name:'Corrosion Pitting',category:'Surface',description:'Fine irregular pits mixed with localized corrosion deposits.',tags:['pits','rust','micro'],masks:[fx(10,{scale:5.5,cavity:.52,breakup:.40,breakupScale:4.4},'replace',.8),fx(7,{scale:7.4,contrast:2.7},'multiply',.43)]},
 {id:'curvature-convex',name:'Convex Curvature',category:'Curvature',description:'Signed mean curvature emphasizing convex areas with controllable smoothing.',tags:['convex','curvature','shape'],masks:[fx(13,{meanCurvatureRegion:0,meanCurvatureSmoothing:.35,meanCurvatureCutoff:.14,meanCurvatureIntensity:2.2})]},
 {id:'curvature-concave',name:'Concave Curvature',category:'Curvature',description:'Signed mean curvature isolating concave areas and rounded recesses.',tags:['concave','cavity','curvature'],masks:[fx(13,{meanCurvatureRegion:1,meanCurvatureSmoothing:.52,meanCurvatureCutoff:.12,meanCurvatureIntensity:2.6})]},
 {id:'curvature-broad',name:'Broad Surface Shape',category:'Curvature',description:'Wide curvature zones suited to soft broad accumulation.',tags:['shape','broad','smooth'],masks:[fx(13,{meanCurvatureRegion:2,meanCurvatureSmoothing:1,meanCurvatureCutoff:.09,meanCurvatureIntensity:1.7})]}
];
export const BUILTIN_MASK_PRESETS=Object.freeze(builtins.map(p=>Object.freeze({...p,masks:Object.freeze(p.masks.map(m=>Object.freeze(m)))})));
const allowedParameters=[
 'mask','combine','opacity','enabled','maskInvert','scale','seed','contrast','breakup','breakupScale',
 'breakupHardness','breakupPosition','breakupWidth','edgeDistance','angleThreshold','softness',
 'density','length','width','direction','gravity','cavity','aoProtect','topBias',
 'meanCurvatureRegion','meanCurvatureSmoothing','meanCurvatureCutoff','meanCurvatureIntensity'
];
const blends=new Set(['replace','multiply','add','subtract','max','min']);
function sanitizeMask(effect){
 if(!effect||!Number.isInteger(effect.mask)||effect.mask<0||effect.mask>13)return null;
 const clean={mask:effect.mask,combine:blends.has(effect.combine)?effect.combine:'multiply',
  opacity:Number.isFinite(effect.opacity)?Math.min(1,Math.max(0,effect.opacity)):1,
  enabled:effect.enabled!==false};
 for(const key of allowedParameters){
   if(['mask','combine','opacity','enabled'].includes(key))continue;
   if(key==='maskInvert'){if(typeof effect[key]==='boolean')clean[key]=effect[key];continue;}
   if(typeof effect[key]==='number'&&Number.isFinite(effect[key])){
     clean[key]=Math.min(1000,Math.max(-1000,effect[key]));
   }
 }
 return clean;
}
export function sanitizeMaskPreset(input,{custom=true}={}){
 if(!input||typeof input!=='object'||!Array.isArray(input.masks)||!input.masks.length||input.masks.length>12)return null;
 const name=String(input.name||'').trim().slice(0,70);
 if(!name)return null;
 const masks=input.masks.map(sanitizeMask);
 if(masks.some(x=>!x))return null;
 const description=String(input.description||'Custom smart-mask stack').trim().slice(0,240);
 const id=custom?String(input.id||'').slice(0,90):String(input.id);
 if(custom && !/^user-[a-z0-9_-]{4,80}$/i.test(id))return null;
 return {id,name,category:custom?'My presets':String(input.category||'Surface'),
  description,tags:[],masks,custom};
}
export function loadUserMaskPresets(storage){
 try{
  const raw=storage?.getItem(PRESET_STORAGE_KEY);
  if(!raw||raw.length>600000)return [];
  const values=JSON.parse(raw);
  if(!Array.isArray(values))return [];
  return values.slice(0,48).map(x=>sanitizeMaskPreset(x)).filter(Boolean);
 }catch{return [];}
}
export function writeUserMaskPresets(storage,values){
 if(!Array.isArray(values)||values.length>48)throw Error('Maximum 48 custom mask presets.');
 const validated=values.map(x=>sanitizeMaskPreset(x));
 if(validated.some(x=>!x))throw Error('Invalid smart-mask preset.');
 const content=JSON.stringify(validated);
 if(content.length>600000)throw Error('Custom mask presets exceed storage allowance.');
 storage.setItem(PRESET_STORAGE_KEY,content);
 return validated;
}
export function captureMaskPreset(name,masks,description='Saved smart-mask recipe'){
 const clean=sanitizeMaskPreset({
   id:'user-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
   name,description,masks
 });
 if(!clean)throw Error('A preset needs a name and 1–12 valid masks.');
 return clean;
}
export function instantiateMaskPreset(preset,makeEffect){
 const valid=sanitizeMaskPreset(preset,{custom:false});
 if(!valid)throw Error('Invalid smart-mask preset.');
 return valid.masks.map(effect=>{
   const {mask,...params}=effect;
   const fresh=makeEffect(mask,params);
   fresh.combine=params.combine;
   fresh.opacity=params.opacity;
   fresh.enabled=params.enabled;
   return fresh;
 });
}
