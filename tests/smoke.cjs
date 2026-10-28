const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  let app, page;
  const errors = [];
  try {
    app = await electron.launch({
      args:['.'],
      env:{...process.env, PEENT_TEST:'1'},
      timeout:60000
    });
    page = await app.firstWindow({timeout:60000});
    page.on('pageerror', e=>errors.push('pageerror: '+e.message));
    page.on('console', msg=>{
      if(msg.type()==='error')errors.push('console: '+msg.text());
    });
    await page.locator('#gpu-info').waitFor({state:'visible',timeout:45000});
    const gpuInfo=await page.locator('#gpu-info').innerText();
    assert.match(gpuInfo,/GPU/);
    await page.locator('#layer-list .layer').first().waitFor({timeout:15000});
    await page.waitForFunction(()=>{
      const s=document.getElementById('status')?.textContent||'';
      return /baked|Bake error|initialization failed/i.test(s);
    },null,{timeout:180000});
    const status=await page.locator('#status').innerText();
    assert.match(await page.locator('#mesh-info').innerText(),/Default cube/i);
    assert.equal(await page.evaluate(()=>document.querySelector('#resolution option[value="2048"]').defaultSelected),true,
      '2048 px must be the actual default for production meshes');
    await page.locator('#btn-mesh-maps').click();
    const dialog=page.locator('#mesh-bake-dialog');
    await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('#btn-bake').count(),1,'Bake is located inside the popup');
    assert.equal(await page.locator('.inspector #btn-bake').count(),0,'Mesh bake controls should not occupy the inspector');
    assert.match(await dialog.locator('#map-bake-status').innerText(),/baked/i);
    await dialog.locator('#mesh-bake-cancel').click();
    await dialog.waitFor({state:'hidden'});

    // Directly inspect the half-res AO bake and then the AO smart generator.
    // Both must render without WebGL feedback-loop or shader errors at UV seams.
    await page.locator('#channel-view').selectOption('ao');
    await page.waitForTimeout(280);
    await page.screenshot({path:path.join(__dirname,'smoke-baked-ao-seams.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('smartMask');
    const aoGenerator=page.locator('.row:has(label:text-is("Generator")) select');
    await aoGenerator.selectOption('3');
    await page.waitForTimeout(380);
    await page.screenshot({path:path.join(__dirname,'smoke-ao-generator-seams.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('material');
    // Exercise live GPU shaders for the repaired low-poly edge baker and weathering generators.
    const generator=page.locator('.row:has(label:text-is("Generator")) select');
    await generator.selectOption('1');
    const edgeInput=page.locator('.number-control:has(label:text-is("Edge distance")) input[type=number]');
    await edgeInput.fill('0.07');
    await edgeInput.press('Tab');
    await page.waitForTimeout(350);
    assert.equal(await edgeInput.inputValue(),'0.07');
    // Smart mask UV seam fixing is enabled by default, remains configurable,
    // and must not trigger shader/feedback-loop errors while recompositing.
    const seamToggle=page.locator('#seam-fix-enabled');
    await seamToggle.waitFor({state:'visible'});
    assert.equal(await seamToggle.isChecked(),true);
    const seamRadius=page.locator('.number-control:has(label:text-is("Seam blend width (px)")) input[type=number]');
    assert.equal(await seamRadius.inputValue(),'3.5');
    await seamRadius.fill('5');
    await seamRadius.press('Tab');
    assert.equal(await seamRadius.inputValue(),'5');
    await seamToggle.uncheck();
    await page.waitForTimeout(180);
    await seamToggle.check();
    await seamRadius.fill('3.5');
    await seamRadius.press('Tab');
    await page.waitForTimeout(400);
    // Every generator exposes an Angle Threshold. Check per-effect isolation and
    // multiple masks/blend modes on one material, not just an extra material layer.
    const initialCount=await page.locator('.mask-stack-item').count();
    assert.equal(initialCount,1);
    await page.locator('#mask-add-type').selectOption('11');
    await page.locator('#btn-add-smart-mask').click();
    assert.equal(await page.locator('.mask-stack-item').count(),2);
    await page.locator('.row:has(label:text-is("Combine")) select').selectOption('add');
    const angleField=page.locator('.number-control:has(label:text-is("Angle threshold")) input[type=number]');
    await angleField.fill('80');
    await angleField.press('Tab');
    assert.equal(await angleField.inputValue(),'80');
    await page.locator('.mask-stack-item').first().locator('.mask-name').click();
    assert.equal(await page.locator('.row:has(label:text-is("Generator")) select').inputValue(),'1');
    await page.locator('.mask-stack-item').last().locator('.mask-name').click();
    assert.equal(await page.locator('.row:has(label:text-is("Generator")) select').inputValue(),'11');
    // Return to convex wear for the remainder of the original screenshot checks.
    await page.locator('.mask-stack-item').first().locator('.mask-name').click();
    const controls={
      'Breakup intensity':'0.73',
      'Breakup hardness':'0.92',
      'Breakup position':'0.61',
      'Breakup band width':'0.46'
    };
    for(const [name,value] of Object.entries(controls)){
      const field=page.locator('.number-control').filter({has:page.locator('label',{hasText:name})});
      const input=field.locator('input[type=number]');
      await input.fill(value);
      await input.press('Tab');
      assert.equal(await input.inputValue(),value,'Control not retained: '+name);
    }
    // Regression: previous max 0.95 and a hard shader cutoff at 0.975 meant
    // users could never carry wear breakup all the way into the edge core.
    const edgePosition=page.locator('.number-control:has(label:text-is("Breakup position")) input[type=number]');
    const edgeBand=page.locator('.number-control:has(label:text-is("Breakup band width")) input[type=number]');
    await edgePosition.fill('1');
    await edgePosition.press('Tab');
    await edgeBand.fill('2');
    await edgeBand.press('Tab');
    assert.equal(await edgePosition.inputValue(),'1');
    assert.equal(await edgeBand.inputValue(),'2');
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(__dirname,'smoke-edge-full-breakup.png'),timeout:20000});
    // Final contrast must sharpen the combined soft distance+noise mask.
    await page.locator('#channel-view').selectOption('smartMask');
    const maskContrast=page.locator('.number-control:has(label:text-is("Contrast")) input[type=number]');
    await maskContrast.fill('1');
    await maskContrast.press('Tab');
    await page.waitForTimeout(380);
    await page.screenshot({path:path.join(__dirname,'smoke-edge-soft-combined.png'),timeout:20000});
    await maskContrast.fill('4.5');
    await maskContrast.press('Tab');
    await page.waitForTimeout(380);
    await page.screenshot({path:path.join(__dirname,'smoke-edge-final-contrast.png'),timeout:20000});
    await maskContrast.fill('1.6');
    await maskContrast.press('Tab');
    await page.locator('#channel-view').selectOption('material');
    // Existing control behavior (including defaults and resets) stays intact.
    await edgePosition.fill('0.61');await edgePosition.press('Tab');
    await edgeBand.fill('0.46');await edgeBand.press('Tab');
    // Exercise a burst of changes without requiring costly work for every input.
    const burstStart=Date.now();
    await page.evaluate(()=>{
      const field=[...document.querySelectorAll('.number-control')].find(el=>el.querySelector('label')?.textContent==='Breakup position');
      const slider=field.querySelector('input[type=range]');
      for(let i=0;i<25;i++){
        slider.value=String(.35+i*.01);
        slider.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    assert.ok(Date.now()-burstStart<12000,'Slider event handling must not synchronously bake every change');
    await page.waitForTimeout(900);
    const position=page.locator('.number-control').filter({has:page.locator('label',{hasText:'Breakup position'})});
    assert.equal(await position.locator('input[type=number]').inputValue(),'0.59');
    await position.locator('button.reset').click();
    assert.equal(await position.locator('input[type=number]').inputValue(),'0.53');
    await page.waitForTimeout(450);
    await page.screenshot({path:path.join(__dirname,'smoke-edge.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('smartMask');
    for(const mask of ['8','9','10','11','12']){
      await generator.selectOption(mask);
      const allAngles=page.locator('.number-control:has(label:text-is("Angle threshold")) input[type=number]');
      assert.equal(await allAngles.count(),1);
      await page.waitForTimeout(350);
      await page.screenshot({path:path.join(__dirname,'smoke-mask-'+mask+'.png'),timeout:20000});
    }
    // Signed mean curvature is an additional independent mask, not a
    // replacement for existing curvature/edge generators.
    await page.locator('#mask-add-type').selectOption('13');
    await page.locator('#btn-add-smart-mask').click();
    assert.equal(await page.locator('.mask-stack-item').count(),3);
    assert.equal(await page.locator('.row:has(label:text-is("Generator")) select').inputValue(),'13');
    await page.locator('.row:has(label:text-is("Curvature region")) select').selectOption('1');
    for(const [name,value] of [
      ['Curvature smoothing','0.75'],
      ['Curvature cutoff','0.19'],
      ['Curvature intensity','3.2']
    ]){
      const control=page.locator('.number-control').filter({has:page.locator('label',{hasText:name})});
      const input=control.locator('input[type=number]');
      await input.fill(value);await input.press('Tab');
      assert.equal(await input.inputValue(),value,'Curvature property failed: '+name);
    }
    await page.locator('#channel-view').selectOption('signedMeanCurvature');
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(__dirname,'smoke-signed-curvature-map.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('smartMask');
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(__dirname,'smoke-signed-curvature-mask.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('material');
    // Browse curated presets, filter/search and apply a multi-mask recipe.
    await page.locator('#btn-browse-masks').click();
    await page.locator('#mask-preset-browser').waitFor({state:'visible'});
    const gallery=page.locator('#mask-preset-grid .preset-card');
    assert.ok(await gallery.count()>=18,'Expected curated, visually browsable mask recipes');
    const presetSearch=page.locator('#mask-preset-search');
    await presetSearch.fill('Aged Painted Metal');
    assert.equal(await gallery.count(),1,'Preset search should filter names/tags');
    await gallery.first().click();
    assert.match(await page.locator('#mask-preset-detail').innerText(),/Chipped|oxidation|Aged/i);
    const beforePreset=await page.locator('.mask-stack-item').count();
    await page.locator('#mask-preset-add').click();
    assert.equal(await page.locator('.mask-stack-item').count(),beforePreset+3);
    await page.waitForTimeout(650);
    // Save a custom stack with the live editable mask parameters.
    await page.locator('#btn-browse-masks').click();
    await page.locator('.preset-save-trigger').click();
    await page.locator('#mask-preset-name').fill('Smoke saved recipe');
    await page.locator('#mask-preset-save-stack').click();
    await page.locator('.preset-category').filter({hasText:'My presets'}).click();
    assert.ok((await page.locator('#mask-preset-grid .preset-card').count())>=1,'Saved stack should appear in My presets');
    await page.locator('#mask-preset-grid .preset-card').filter({hasText:'Smoke saved recipe'}).click();
    assert.match(await page.locator('#mask-preset-detail').innerText(),/Smoke saved recipe/);
    await page.screenshot({path:path.join(__dirname,'smoke-preset-browser.png'),timeout:20000});
    const savedCount=await page.locator('.mask-stack-item').count();
    await page.locator('#mask-preset-replace').click();
    assert.equal(await page.locator('.mask-stack-item').count(),savedCount,
      'Replacing a stack with its own saved preset must preserve mask count');
    await page.locator('#btn-browse-masks').click();
    await page.locator('.preset-category').filter({hasText:'My presets'}).click();
    await page.locator('#mask-preset-grid .preset-card').filter({hasText:'Smoke saved recipe'}).click();
    await page.locator('#mask-preset-delete').click();
    assert.equal(await page.locator('#mask-preset-grid .preset-card').count(),0,'Custom preset deletion should persist');
    await page.locator('.preset-close').click();

    // Material library: persist one editable material and a complete material
    // stack, search them, apply without rebaking mesh maps, and delete them.
    const savedLayers=await page.locator('#layer-list .layer').count();
    await page.locator('#btn-material-browser').click();
    const materialOverlay=page.locator('#material-browser');
    await materialOverlay.waitFor({state:'visible'});
    assert.ok(await page.locator('#material-browser-grid .material-card').count()>=9,'Built-in materials should be visible');
    await page.locator('#material-browser-search').fill('Base iron');
    assert.equal(await page.locator('#material-browser-grid .material-card').count(),1);
    await page.locator('#material-browser-search').fill('');
    await page.locator('#btn-save-material').click();
    await page.locator('#material-save-name').fill('GPU smoke custom material');
    await page.locator('#material-save-selected').click();
    await page.locator('.material-category').filter({hasText:'My materials'}).click();
    await page.locator('#material-browser-grid .material-card').filter({hasText:'GPU smoke custom material'}).click();
    assert.match(await page.locator('#material-browser-details').innerText(),/GPU smoke custom material/);
    await page.locator('#material-apply-add').click();
    assert.equal(await page.locator('#layer-list .layer').count(),savedLayers+1);
    await page.locator('#btn-material-browser').click();
    await page.locator('#btn-save-material').click();
    await page.locator('#material-save-name').fill('GPU smoke entire stack');
    await page.locator('#material-save-stack').click();
    await page.locator('.material-category').filter({hasText:'My materials'}).click();
    await page.locator('#material-browser-grid .material-card').filter({hasText:'GPU smoke entire stack'}).click();
    await page.screenshot({path:path.join(__dirname,'smoke-material-browser.png'),timeout:20000});
    await page.locator('#material-apply-replace').click();
    assert.equal(await page.locator('#layer-list .layer').count(),savedLayers+1,
      'Restoring a saved material stack must recreate its editable layers');
    assert.match(await page.locator('#status').innerText(),/material/i);
    await page.locator('#btn-material-browser').click();
    await page.locator('.material-category').filter({hasText:'My materials'}).click();
    await page.locator('#material-browser-grid .material-card').filter({hasText:'GPU smoke entire stack'}).click();
    await page.locator('#material-delete').click();
    await page.waitForFunction(()=>document.querySelectorAll('#material-browser-grid .material-card').length===1);
    await page.locator('#material-browser-grid .material-card').filter({hasText:'GPU smoke custom material'}).click();
    await page.locator('#material-delete').click();
    await page.waitForFunction(()=>document.querySelectorAll('#material-browser-grid .material-card').length===0);
    assert.equal(await page.locator('#material-browser-grid .material-card').count(),0,'Custom materials should be deletable');
    await page.locator('.material-browser-close').click();
    await materialOverlay.waitFor({state:'hidden'});
    const accent=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert.equal(accent,'#f28c40');
    const scroll=await page.locator('.inspector').evaluate(el=>{
      el.scrollTop=el.scrollHeight;
      return {top:el.scrollTop,scrollable:el.scrollHeight>el.clientHeight};
    });
    assert.ok(scroll.scrollable&&scroll.top>0,'Inspector must scroll to the bottom controls');
    await page.screenshot({path:path.join(__dirname,'smoke.png'),timeout:20000});
    assert.match(status,/baked/i,'Baking did not succeed: '+status);
    assert.ok((await page.locator('#layer-list .layer').count())>=4);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('GPU UI smoke passed:',gpuInfo,status);
  } catch(error) {
    console.error('GUI smoke failed:',error.message);
    if(errors.length)console.error(errors.join('\n'));
    if(page){try{await page.screenshot({path:path.join(__dirname,'smoke.png'),timeout:10000});}catch{}}
    process.exitCode=1;
  } finally {
    if(app)await app.close().catch(()=>{});
  }
})();
