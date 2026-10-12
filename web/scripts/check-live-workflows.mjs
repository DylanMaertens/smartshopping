// Invoked by ops/test-backend-postgres.py --browser, on a new isolated database only.
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer as httpsServer } from 'node:https';
import { createServer as tcpServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { spawn,execFileSync } from 'node:child_process';
const {chromium} = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const database = process.env.TEST_DATABASE_URL;
assert.ok(database?.startsWith('postgresql:///browser_test?host=%2Ftmp%2Fpoduna-workflows-pg-'),'Use the isolated PostgreSQL test runner');
const backend = process.env.PODUNA_TEST_BACKEND || resolve('backend/target/debug/shopping-list-backend');
const hasher = process.env.PODUNA_TEST_HASHER || resolve('backend/target/debug/admin-password-hash');
const temp = await mkdtemp(join(tmpdir(),'poduna-workflow-browser-'));
const output = resolve('web/.qa/live-workflows'); await mkdir(output,{recursive:true});
const sql = command => execFileSync(process.env.PODUNA_TEST_PSQL,['-X',database,'-v','ON_ERROR_STOP=1','-At','-c',command],{encoding:'utf8'}).trim();
let child,proxy,browser;
const password = 'Fixture password for workflow tests only!';
try {
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  const hash = execFileSync(hasher,{input:password,encoding:'utf8'}).trim();
  await writeFile(join(temp,'credentials.json'),JSON.stringify({username:'qa-owner',password_hash:hash}),{mode:0o600});
  const reserve = tcpServer(); await new Promise(r=>reserve.listen(0,'127.0.0.1',r)); const port = reserve.address().port; await new Promise(r=>reserve.close(r));
  proxy = httpsServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},(req,res)=>{
    const upstream = httpRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502);res.end();}); req.pipe(upstream);
  });
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r)); const origin = `https://127.0.0.1:${proxy.address().port}`;
  child = spawn(backend,[],{env:{PATH:process.env.PATH,HOST:'127.0.0.1',PORT:String(port),DATABASE_URL:database,ADMIN_CREDENTIALS_FILE:join(temp,'credentials.json'),ADMIN_ORIGIN:origin,ENABLE_CONTACT_FORM:'true',ENABLE_COMMUNITY_CATALOG:'false',ENABLE_OFF_PROXY:'false',REQUIRE_DEVICE_SIGNATURES:'true',DEVICE_REGISTRY_PATH:join(temp,'devices.json'),RUST_LOG:'error'},stdio:'ignore'});
  for(let i=0;;i++){if(child.exitCode!==null||i>80)throw new Error('Isolated backend not ready');try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  for (const width of [1440,768,390,320]) {
    const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}}), page = await context.newPage();
    let acceptDialog = true;
    const errors=[],external=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());}); page.on('dialog',d=>acceptDialog ? d.accept() : d.dismiss());
    await page.goto(`${origin}/contact.html`); await page.waitForFunction(()=>!document.getElementById('contact-fields').disabled);
    assert.equal(await page.locator('.brand-logo').getAttribute('src'),'/assets/brand/logo.svg');
    if (width>760) {
      const a=await page.locator('.contact-card').boundingBox(),b=await page.locator('.contact-help').boundingBox();
      assert.ok(Math.abs(a.y-b.y)<1,'Live contact cards aligned');
    }
    await page.locator('#email').fill(`qa-${width}@example.invalid`); await page.locator('#topic').selectOption('technical');
    await page.locator('#message').fill(`Fixture ${width} <img src=x onerror=alert(1)> contact message`);
    await page.getByRole('button',{name:'Relire avant l’envoi',exact:true}).click();
    assert.equal(await page.locator('#summary img').count(),0);
    if(width===1440){
      await page.route('**/api/v1/contact',async route=>{await route.fetch();await route.abort();});
      await page.locator('#send').click(); await page.waitForFunction(()=>!document.getElementById('send').disabled);
      assert.equal(sql("SELECT count(*) FROM contact_messages"),'1');
      await page.unroute('**/api/v1/contact');
    }
    await page.locator('#send').click(); await page.waitForFunction(()=>document.getElementById('contact-status').textContent.startsWith('Message reçu.'));
    assert.equal(sql(`SELECT count(*) FROM contact_messages WHERE email='qa-${width}@example.invalid'`),'1');
    await page.screenshot({path:join(output,`contact-${width}.png`),fullPage:true});
    for(const size of ['200%','']){await page.evaluate(size=>document.documentElement.style.fontSize=size,size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`contact overflow ${width}/${size}`);}
    await page.goto(`${origin}/admin/#messages`); await page.locator('#login-panel').waitFor({state:'visible'});
    await page.locator('#username').fill('qa-owner'); await page.locator('#password').fill(password); await page.locator('#login-button').click();
    await page.waitForFunction(()=>document.getElementById('pending-messages').textContent==='1');
    await page.locator('#messages-search').fill('no-matching-address'); await page.locator('#messages-search-form button[type="submit"]').click();
    await page.getByText('Aucun dossier dans cet état.',{exact:true}).waitFor();
    assert.equal(await page.locator('#pending-messages').textContent(),'1','Counters ignore search');
    await page.locator('#messages-search').fill(`qa-${width}@example.invalid`); await page.locator('#messages-search-form button[type="submit"]').click();
    await page.locator('#messages-results .card').filter({hasText:`qa-${width}@example.invalid`}).getByRole('button',{name:'Examiner'}).click();
    await page.locator('#decision-form').waitFor({state:'visible'});
    await page.locator('#decision-reason').fill('Brouillon à conserver'); acceptDialog=false;
    await page.locator('#dossier-close').click();
    assert.equal(await page.locator('#dossier').isVisible(),true); assert.equal(await page.locator('#decision-reason').inputValue(),'Brouillon à conserver');
    if (width===1440) {
      await page.reload({timeout:5000}).catch(error=>assert.match(error.message,/ERR_ABORTED|aborted|Timeout/));
      assert.equal(await page.locator('#decision-reason').inputValue(),'Brouillon à conserver');
    }
    acceptDialog=true;
    assert.ok((await page.locator('#dossier-content').textContent()).includes('<img src=x onerror=alert(1)>'));
    assert.equal(await page.locator('#dossier-content img').count(),0);
    await page.locator('#decision-action').selectOption('active'); await page.locator('#decision-reason').fill('Diagnostic de test en cours');
    if (width===1440) {
      await page.route('**/admin/api/queues/messages/*/decision',route=>route.fulfill({status:503,json:{code:'WORKFLOW_UNAVAILABLE'}}));
      await page.locator('#decision-submit').click(); await page.locator('#dossier-notice').getByText(/Base de données indisponible/).waitFor();
      assert.equal(await page.locator('#decision-reason').inputValue(),'Diagnostic de test en cours');
      await page.unroute('**/admin/api/queues/messages/*/decision');
    }
    await page.locator('#decision-submit').click();
    await page.locator('#dossier').waitFor({state:'hidden'}); await page.locator('#messages-status').selectOption('active');
    await page.locator('#messages-results .card').filter({hasText:`qa-${width}@example.invalid`}).getByRole('button',{name:'Examiner'}).click();
    await page.locator('#dossier-history').getByText(/qa-owner/).waitFor();
    await page.screenshot({path:join(output,`message-detail-${width}.png`),fullPage:true});
    await page.locator('#decision-action').selectOption('closed'); await page.locator('#decision-reason').fill('Test traité sans envoi de réponse'); await page.locator('#decision-submit').click(); await page.locator('#dossier').waitFor({state:'hidden'});
    assert.equal(sql(`SELECT status FROM contact_messages WHERE email='qa-${width}@example.invalid'`),'closed');
    await page.waitForFunction(()=>document.getElementById('pending-messages').textContent==='0');
    // Seed a fictional pending proposal/report; never enable the public catalogue.
    const device=randomUUID(),proposal=randomUUID(),report=randomUUID(),now=Date.now();
    sql(`INSERT INTO anonymous_devices(device_id,first_seen_at,last_seen_at) VALUES('${device}',${now},${now}); INSERT INTO community_product_proposals(id,barcode,field_name,value,normalized_value,contributor_device_id,created_at,updated_at) VALUES('${proposal}','12345678${width}','name','Fixture ${width}','fixture ${width}','${device}',${now},${now}); INSERT INTO community_proposal_reports(id,proposal_id,reporter_device_id,reason,created_at) VALUES('${report}','${proposal}','${device}','wrong_name',${now});`);
    await page.locator('nav a[href="#moderation"]').click();
    await page.locator('#moderation-results .card').filter({hasText:`Fixture ${width}`}).getByRole('button',{name:'Examiner'}).click(); await page.locator('#decision-form').waitFor({state:'visible'});
    await page.locator('#decision-action').selectOption('withdraw'); await page.locator('#decision-reason').fill('Proposition incorrecte dans le test');
    await page.screenshot({path:join(output,`moderation-detail-${width}.png`),fullPage:true});
    await page.locator('#decision-submit').click(); await page.locator('#dossier').waitFor({state:'hidden'});
    assert.equal(sql(`SELECT status FROM community_product_proposals WHERE id='${proposal}'`),'rejected');
    assert.equal(sql(`SELECT status FROM community_proposal_reports WHERE id='${report}'`),'upheld');
    await page.locator('#moderation-status').selectOption('upheld'); await page.locator('#moderation-results .card').first().waitFor();
    await page.screenshot({path:join(output,`moderation-${width}.png`),fullPage:true});
    for(const size of ['200%','']){await page.evaluate(size=>document.documentElement.style.fontSize=size,size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`moderation overflow ${width}/${size}`);}
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    await page.locator('#logout').click(); await page.locator('#login-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#dossier-content').textContent(),''); assert.equal(await page.locator('#messages-results').textContent(),'');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
    console.log(`${width}px: real contact/retry/inbox/status/audit/report/withdrawal, no XSS or browser storage, 200% layout OK`);
  }
} finally {
  await browser?.close(); if(child && child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));} if(proxy)await new Promise(r=>proxy.close(r));
  await rm(temp,{recursive:true,force:true});
}
