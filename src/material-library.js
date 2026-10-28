// Portable, versioned material recipes. These store editable layer/mask settings,
// not mesh-specific UV paint strokes or baked texture maps. Image fills travel
// with the material (subject to the application's size limits).
export const MATERIAL_LIBRARY_KEY='peent3d.material-library.v1';
export const MATERIAL_LIBRARY_VERSION=1;
export const MATERIAL_CATEGORIES=['All','Metal','Paint','Stone','Organic','Surface','My materials'];
const MASK_NUMBER=['mask','scale','seed','contrast','breakup','breakupScale','breakupHardness',
 'breakupPosition','breakupWidth','edgeDistance','angleThreshold','softness','density',
 'length','width','direction','gravity','cavity','aoProtect','topBias',
 'meanCurvatureRegion','meanCurvatureSmoothing','meanCurvatureCutoff','meanCurvatureIntensity','opacity'];
const LAYER_NUMBER=['roughness','metallic','height','opacity','scale','variation','seed'];
const VALID_COMBINE=new Set(['multiply','add','subtract','replace','max','min']);
const VALID_PROJECTION=new Set(['triplanar','uv']);
const asText=(value,max=80)=>String(value??'').trim().slice(0,max);
const allowedImage=data=>data===null||data===undefined||
 (typeof data==='string'&&data.length<22*1024*1024&&
 /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(data));
const numeric=(obj,fields,result)=>{
 for(const name of fields)if(obj[name]!==undefined){
   if(!Number.isFinite(obj[name]))return false;
   result[name]=Number(obj[name]);
 }
 return true;
};
export function serializeMaterialLayer(layer){
 if(!layer||typeof layer!=='object'||!/^#[0-9a-f]{6}$/i.test(String(layer.color??'')))return null;
 if(!allowedImage(layer.imageData))return null;
 const item={
   name:asText(layer.name,75)||'Material layer',
   color:layer.color,projection:VALID_PROJECTION.has(layer.projection)?layer.projection:'triplanar',
   visible:layer.visible!==false,
   imageData:layer.imageData||null,
   masks:[]
 };
 if(!numeric(layer,LAYER_NUMBER,item))return null;
 const effects=Array.isArray(layer.masks)?layer.masks:[layer];
 if(effects.length>16)return null;
 for(const mask of effects){
   if(!Number.isInteger(mask.mask)||mask.mask<0||mask.mask>13)return null;
   const clean={mask:mask.mask,enabled:mask.enabled!==false,
     combine:VALID_COMBINE.has(mask.combine)?mask.combine:'multiply',
     maskInvert:mask.maskInvert===true};
   if(!numeric(mask,MASK_NUMBER,clean))return null;
   item.masks.push(clean);
 }
 return item;
}
export function normalizeMaterialRecipe(input,{requireId=true}={}){
 if(!input||typeof input!=='object')return null;
 const name=asText(input.name,75);
 const id=asText(input.id,100);
 if(!name||(requireId&&!/^material-[a-z0-9_-]{5,92}$/i.test(id)))return null;
 if(!Array.isArray(input.layers)||input.layers.length<1||input.layers.length>16)return null;
 const layers=input.layers.map(serializeMaterialLayer);
 if(layers.some(layer=>!layer))return null;
 const category=MATERIAL_CATEGORIES.includes(input.category)?input.category:'My materials';
 return {id,name,category,description:asText(input.description,240),
   createdAt:Number.isFinite(input.createdAt)?input.createdAt:Date.now(),
   layers,version:MATERIAL_LIBRARY_VERSION};
}
export function createMaterialRecipe(name,layers,description=''){
 const id='material-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
 const candidate=normalizeMaterialRecipe({id,name,description,category:'My materials',layers});
 if(!candidate)throw Error('Material requires a name and 1–16 valid layers.');
 return candidate;
}
export function instantiateMaterialRecipe(recipe,makeLayer){
 const valid=normalizeMaterialRecipe(recipe,{requireId:false});
 if(!valid)throw Error('Invalid material recipe.');
 // Each call generates fresh live layer IDs and fresh effect IDs; no cached
 // material can mutate a saved recipe or accidentally share a GPU mask ID.
 return valid.layers.map(layer=>{
   const copy={...layer,
     masks:layer.masks.map(mask=>({...mask}))};
   delete copy.id;
   return makeLayer(copy);
 });
}
export function parseMaterialLibrary(raw){
 try{
   const data=typeof raw==='string'?JSON.parse(raw):raw;
   if(!data||data.version!==MATERIAL_LIBRARY_VERSION||!Array.isArray(data.materials))return [];
   return data.materials.slice(0,80).map(m=>normalizeMaterialRecipe(m)).filter(Boolean);
 }catch{return [];}
}
export function encodeMaterialLibrary(materials){
 if(!Array.isArray(materials)||materials.length>80)throw Error('Maximum 80 materials in the library.');
 const clean=materials.map(m=>normalizeMaterialRecipe(m));
 if(clean.some(m=>!m))throw Error('Invalid material in library.');
 const text=JSON.stringify({format:'peent3d-material-library',version:MATERIAL_LIBRARY_VERSION,materials:clean});
 if(text.length>48*1024*1024)throw Error('Material library exceeds 48 MB; reduce embedded images.');
 return text;
}
export function starterMaterialRecipes(layers){
 return layers.map((layer,i)=>({
   id:'starter-'+i,name:layer.name,category:
     i===0?'Metal':i===1?'Paint':i===4?'Metal':i===5?'Surface':i>=6?'Surface':'Surface',
   description:'Built-in editable material starter.',
   layers:[serializeMaterialLayer(layer)],version:MATERIAL_LIBRARY_VERSION,
   createdAt:0,builtin:true
 })).filter(x=>x.layers[0]);
}
