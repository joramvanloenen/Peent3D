import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MATERIAL_LIBRARY_KEY,MATERIAL_LIBRARY_VERSION,MATERIAL_CATEGORIES,
 serializeMaterialLayer,normalizeMaterialRecipe,createMaterialRecipe,
 instantiateMaterialRecipe,parseMaterialLibrary,encodeMaterialLibrary,starterMaterialRecipes
} from '../src/material-library.js';
const layer={
 id:'layer-23',name:'Copper and patina',color:'#bb8855',roughness:.3,metallic:.86,
 height:.02,opacity:.78,scale:3.4,projection:'triplanar',variation:.19,visible:true,
 imageData:null,
 masks:[
  {id:'mask-10',mask:1,edgeDistance:.052,angleThreshold:24,breakupPosition:.97,breakupWidth:1.5,
   opacity:.65,enabled:true,combine:'replace'},
  {id:'mask-11',mask:13,meanCurvatureRegion:1,meanCurvatureSmoothing:.72,
   combine:'multiply',enabled:true,opacity:.44}
 ]};
test('saving material preserves color, image settings and complete editable smart-mask stack',()=>{
 const saved=serializeMaterialLayer(layer);
 assert.ok(saved);
 assert.equal(saved.id,undefined);
 assert.equal(saved.color,'#bb8855');
 assert.equal(saved.masks.length,2);
 assert.equal(saved.masks[0].id,undefined);
 assert.equal(saved.masks[0].breakupPosition,.97);
 assert.equal(saved.masks[1].meanCurvatureSmoothing,.72);
 assert.equal(saved.masks[1].combine,'multiply');
});
test('material recipe roundtrips with embedded image fill, preserves order and avoids accidental IDs',()=>{
 const jpeg='data:image/jpeg;base64,aGVsbG8=';
 const item=createMaterialRecipe('Test material',[{...layer,imageData:jpeg}, {...layer,name:'Rust overlay',imageData:null}]);
 const text=encodeMaterialLibrary([item]);
 const recovered=parseMaterialLibrary(text);
 assert.equal(recovered.length,1);
 assert.equal(recovered[0].layers[0].imageData,jpeg);
 assert.equal(recovered[0].layers[1].name,'Rust overlay');
 assert.equal(recovered[0].layers[1].masks.length,2);
 assert.equal(recovered[0].layers[1].masks[1].mask,13);
});
test('material instances have new layer/mask identifiers every time and cannot mutate the library',()=>{
 const recipe=createMaterialRecipe('Copper',[layer]);
 let id=0,mask=0;
 const maker=attrs=>({...attrs,id:'layer-'+(++id),masks:attrs.masks.map(x=>({...x,id:'mask-'+(++mask)}))});
 const a=instantiateMaterialRecipe(recipe,maker),b=instantiateMaterialRecipe(recipe,maker);
 assert.notEqual(a[0].id,b[0].id);
 assert.notEqual(a[0].masks[0].id,b[0].masks[0].id);
 a[0].roughness=.99;a[0].masks[0].edgeDistance=.25;
 assert.notEqual(a[0].roughness,b[0].roughness);
 assert.notEqual(a[0].masks[0].edgeDistance,b[0].masks[0].edgeDistance);
 assert.equal(recipe.layers[0].roughness,.3);
});
test('materials must have valid colors and bound media sizes, malformed library fails safely',()=>{
 assert.equal(serializeMaterialLayer({...layer,color:'javascript:alert(1)'}),null);
 assert.equal(serializeMaterialLayer({...layer,imageData:'https://tracker.example/evil.png'}),null);
 assert.equal(serializeMaterialLayer({...layer,masks:[{mask:99}]}),null);
 assert.deepEqual(parseMaterialLibrary('{broken'),[]);
 assert.deepEqual(parseMaterialLibrary('{"version":99,"materials":[]}'),[]);
 const recipe=createMaterialRecipe('Valid',[layer]);
 assert.ok(normalizeMaterialRecipe(recipe));
 assert.throws(()=>encodeMaterialLibrary(Array.from({length:81},()=>recipe)),/Maximum/);
 assert.equal(MATERIAL_LIBRARY_VERSION,1);
 assert.equal(MATERIAL_LIBRARY_KEY,'peent3d.material-library.v1');
});
test('built-in starter materials appear in gallery independently of user-saved materials',()=>{
 const builtin=starterMaterialRecipes([layer,{...layer,name:'Paint'}]);
 assert.equal(builtin.length,2);
 assert.ok(builtin.every(x=>x.builtin));
 assert.ok(MATERIAL_CATEGORIES.includes('My materials'));
 assert.equal(builtin[1].layers[0].name,'Paint');
});
