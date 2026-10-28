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
    // Exercise live GPU shaders for the repaired low-poly edge baker and weathering generators.
    const generator=page.locator('.row:has(label:text-is("Generator")) select');
    await generator.selectOption('1');
    const edgeInput=page.locator('.number-control:has(label:text-is("Edge distance")) input[type=number]');
    await edgeInput.fill('0.07');
    await edgeInput.press('Tab');
    await page.waitForTimeout(350);
    assert.equal(await edgeInput.inputValue(),'0.07');
    await page.screenshot({path:path.join(__dirname,'smoke-edge.png'),timeout:20000});
    await page.locator('#channel-view').selectOption('smartMask');
    for(const mask of ['8','9','10','11','12']){
      await generator.selectOption(mask);
      await page.waitForTimeout(350);
      await page.screenshot({path:path.join(__dirname,'smoke-mask-'+mask+'.png'),timeout:20000});
    }
    await page.locator('#channel-view').selectOption('material');
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
