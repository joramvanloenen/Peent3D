import test from 'node:test';
import assert from 'node:assert/strict';
import {
 BUILTIN_MASK_PRESETS,MASK_PRESET_CATEGORIES,PRESET_STORAGE_KEY,
 captureMaskPreset,instantiateMaskPreset,loadUserMaskPresets,writeUserMaskPresets,sanitizeMaskPreset
} from '../src/mask-presets.js';

const storage=()=>({
 state:new Map(),
 getItem(key){return this.state.get(key)||null;},
 setItem(key,value){this.state.set(key,value);},
 removeItem(key){this.state.delete(key);}
});
test('curated gallery contains diverse mask and multi-mask stack presets',()=>{
 assert.ok(BUILTIN_MASK_PRESETS.length>=18);
 assert.equal(new Set(BUILTIN_MASK_PRESETS.map(p=>p.id)).size,BUILTIN_MASK_PRESETS.length);
 assert.ok(MASK_PRESET_CATEGORIES.includes('My presets'));
 assert.ok(BUILTIN_MASK_PRESETS.some(p=>p.masks.length>=3));
 assert.ok(BUILTIN_MASK_PRESETS.some(p=>p.masks.some(m=>m.mask===13)),'Curvature preset should be available');
 assert.ok(BUILTIN_MASK_PRESETS.some(p=>p.masks.some(m=>m.mask===1)),'Convex edge preset should be available');
 for(const p of BUILTIN_MASK_PRESETS)assert.ok(sanitizeMaskPreset(p,{custom:false}));
});
test('instantiating the same preset twice produces new independent, editable mask entries',()=>{
 const p=BUILTIN_MASK_PRESETS.find(x=>x.masks.length>=2);
 let counter=0;
 const make=(type,opts)=>({...opts,mask:type,id:'mask-test-'+(++counter)});
 const a=instantiateMaskPreset(p,make),b=instantiateMaskPreset(p,make);
 assert.equal(a.length,p.masks.length);
 assert.equal(b.length,p.masks.length);
 assert.notEqual(a[0].id,b[0].id);
 a[0].scale=42;
 assert.notEqual(a[0].scale,b[0].scale);
 assert.notEqual(a[0].scale,p.masks[0].scale);
 assert.equal(a[1].combine,p.masks[1].combine);
});
test('saved user recipes persist selected mask settings, stack order and opacity',()=>{
 const fake=storage();
 const selected=[
  {id:'mask-19',mask:1,scale:4.2,breakupPosition:1,breakupWidth:2,breakupHardness:.9,opacity:.76,combine:'replace',enabled:true},
  {id:'mask-20',mask:13,meanCurvatureSmoothing:.77,meanCurvatureRegion:1,combine:'add',opacity:.3}
 ];
 const saved=captureMaskPreset('My custom chipped curvature',selected);
 const all=writeUserMaskPresets(fake,[saved]);
 assert.equal(fake.getItem(PRESET_STORAGE_KEY).includes('My custom chipped curvature'),true);
 const loaded=loadUserMaskPresets(fake);
 assert.equal(loaded.length,1);
 assert.equal(loaded[0].masks[0].breakupPosition,1);
 assert.equal(loaded[0].masks[0].breakupWidth,2);
 assert.equal(loaded[0].masks[1].meanCurvatureSmoothing,.77);
 assert.equal(loaded[0].masks[1].combine,'add');
 assert.equal(loaded[0].masks[0].id,undefined,'Saving should not copy live mask identities');
 assert.equal(all[0].category,'My presets');
 writeUserMaskPresets(fake,[]);
 assert.deepEqual(loadUserMaskPresets(fake),[]);
});
test('custom presets reject unsupported masks, malformed content and overlarge stacks',()=>{
 assert.equal(sanitizeMaskPreset({id:'user-valid',name:'Bad',masks:[{mask:999}]}),null);
 assert.equal(sanitizeMaskPreset({id:'user-valid',name:'',masks:[{mask:1}]}),null);
 assert.equal(sanitizeMaskPreset({id:'user-valid',name:'Overflow',masks:Array.from({length:13},()=>({mask:1}))}),null);
 const fake=storage();fake.setItem(PRESET_STORAGE_KEY,'not json');
 assert.deepEqual(loadUserMaskPresets(fake),[]);
 assert.throws(()=>writeUserMaskPresets(fake,[{id:'unsafe',name:'Preset',masks:[{mask:1}]}]),/Invalid/);
});
test('preset storage enforces maximum custom count',()=>{
 const fake=storage();
 const items=Array.from({length:49},(_,i)=>captureMaskPreset('Test '+i,[{mask:1}]));
 assert.throws(()=>writeUserMaskPresets(fake,items),/Maximum/);
});
