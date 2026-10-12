import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const {chromium} = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PODUNA_WEB_URL || 'http://127.0.0.1:8057';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
await mkdir('web/.qa/help',{recursive:true});
try {
  for(const width of [1440,768,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const path of ['/aide-android.html','/missing/nested-page']) {
      const response=await page.goto(base+path);
      assert.equal(response.status(),path.includes('missing') ? 404 : 200);
      assert.equal(await page.locator('h1').count(),1);
      for(const href of await page.locator('a[href]').evaluateAll(links=>links.map(a=>a.href))) {
        assert.ok(href.startsWith(base));
        const url=new URL(href);
        if(url.pathname===path && url.hash) { assert.equal(await page.locator(url.hash).count(),1); continue; }
        const target=await page.request.head(href);assert.equal(target.status(),200,href);
      }
      assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
      await page.screenshot({path:`web/.qa/help/${path.includes('missing')?'404':'guide'}-${width}.png`,fullPage:true});
      for(const zoom of ['200%','']) {await page.evaluate(v=>document.documentElement.style.fontSize=v,zoom);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} ${width} ${zoom}`);}
    }
    assert.deepEqual(errors,[]);await page.close();console.log(`Guide and real HTTP 404: ${width}px OK`);
  }
  const page=await browser.newPage();
  const response=await page.request.head(`${base}/absent`);assert.equal(response.status(),404);assert.equal((await response.body()).length,0);
} finally {await browser.close();}
