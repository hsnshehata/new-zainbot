'use strict';
// Real dashboard component, all API/provider requests intercepted. No live
// account, merchant data, credential or inventory mutation.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const express=require('express');const puppeteer=require('puppeteer');
const {matchSmokeApi,SMOKE_TOKENS,SMOKE_BOTS}=require('./fixtures/dashboardApi');
(async()=>{let server,browser;try{
 const app=express();app.get('/dashboard',(_q,r)=>r.sendFile(path.resolve(__dirname,'../../public/dashboard.html')));app.use(express.static(path.resolve(__dirname,'../../public')));server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}`;
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();await page.setViewport({width:1280,height:1000});page.on('pageerror',e=>console.error('PAGE_ERROR',e.message));await page.setBypassServiceWorker(true);await page.setCacheEnabled(false);
 await page.evaluateOnNewDocument(token=>{localStorage.setItem('token',token);localStorage.setItem('tokenExpiry',String(Date.now()+3600000));localStorage.setItem('zainbot_lang','en');},SMOKE_TOKENS.ORDINARY);
 const pid='507f191e810c19729de86999',name='Synthetic <img src=x onerror="window.fixtureExecuted=true">';let fail=true,confirmed=false,previews=0;const posts=[];
 const preview={productId:pid,localProductName:name,remoteProductName:'Remote synthetic item',origin:'https://synthetic.myshopify.com',sourceId:'17',sourceKey:'synthetic-source-key',remoteQuantity:10,canReconcile:true,requiresPhysicalSellableCount:true};
 await page.setRequestInterception(true);page.on('request',req=>{
  const u=new URL(req.url());if(u.origin!==base)return req.abort();if(!u.pathname.startsWith('/api/'))return req.continue();let status=200,body;
  if(u.pathname.startsWith('/api/catalog-connectors/')){
   assert.equal(req.headers().authorization,`Bearer ${SMOKE_TOKENS.ORDINARY}`);
   if(u.pathname.endsWith('/reconciliation'))body={products:confirmed?[]:[{_id:pid,productName:name,importSourceId:'17'}]};
   else if(u.pathname.endsWith('/reconcile/'+pid)){
    if(req.method()==='GET'){previews++;body=preview;}
    else {posts.push(JSON.parse(req.postData()));if(fail){status=409;body={error:'CATALOG_SNAPSHOT_CHANGED'};}else{confirmed=true;body={state:'reconciled',productId:pid,sellableQuantity:8};}}
   }else if(u.pathname.endsWith('/sync')){status=409;body={error:'CATALOG_OPEN_CHAT_ORDERS'};}else body={configured:true,provider:'shopify',origin:preview.origin,currency:'EGP',state:confirmed?'idle':'failed',lastError:confirmed?null:'CATALOG_RECONCILIATION_REQUIRED',lastImportedCount:null};
  }else if(u.pathname==='/api/bots')body=SMOKE_BOTS;
  else if(u.pathname.startsWith('/api/bots/'))body={success:true,data:SMOKE_BOTS[0]};
  else if(u.pathname==='/api/whatsapp/session')body={success:true,data:{state:'disconnected'}};
  else if(u.pathname==='/api/telegram/status')body={linked:false};
  else{const decision=matchSmokeApi(req.method(),u.pathname+u.search,req.headers().authorization||'',req.postData()||'','ok');if(decision&&decision.kind!=='unknown'){status=decision.status;body=decision.body;}else{status=404;body={error:'LOCAL_FIXTURE_UNKNOWN'};}}
  return req.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(base+'/dashboard',{waitUntil:'networkidle0'});await page.waitForSelector('[data-target="page-channels"]');await page.$eval('[data-target="page-channels"]',x=>x.click());
 await page.waitForFunction(()=>!document.getElementById('reviewCatalogInventory').disabled);await page.click('#reviewCatalogInventory');await page.waitForSelector('#catalogReconciliationProducts button');assert.equal(await page.$eval('#catalogReconciliationForm',x=>getComputedStyle(x).display),'none');await page.click('#catalogReconciliationProducts button');await page.waitForFunction(()=>!document.getElementById('catalogReconciliationForm').hidden);
 assert.equal(await page.$eval('#catalogSellableQuantity',x=>x.value),'');assert.equal(await page.$eval('#catalogReconcileConfirmed',x=>x.checked),false);assert.equal(await page.$eval('#confirmCatalogInventory',x=>x.disabled),true);assert.equal(posts.length,0);
 assert.equal(await page.evaluate(()=>window.fixtureExecuted),undefined);assert.equal(await page.$$('#catalogReconciliationPanel img').then(x=>x.length),0);
 await page.type('#catalogSellableQuantity','8');assert.equal(await page.$eval('#confirmCatalogInventory',x=>x.disabled),true);await page.click('#catalogReconcileConfirmed');assert.equal(await page.$eval('#confirmCatalogInventory',x=>x.disabled),false);
 const out=process.env.QA_EVIDENCE_DIR||'/tmp/catalog-reconciliation-browser';fs.mkdirSync(out,{recursive:true});await page.$eval('#catalogReconciliationPanel',x=>x.scrollIntoView({block:'center'}));await (await page.$('#catalogReconciliationPanel')).screenshot({path:out+'/owner-confirm-en.png'});
 await (await page.$('#storeConnectorForm')).evaluateHandle(x=>x.closest('.glass-card')).then(x=>x.asElement().screenshot({path:out+'/connector-scope-en.png'}));
 await page.click('#dashboardLangToggle');await page.waitForFunction(()=>document.documentElement.lang==='ar',{timeout:4000});assert.equal(await page.$eval('html',x=>x.lang),'ar');assert.equal(await page.$eval('#catalogSellableQuantity',x=>x.value),'8');assert.equal(await page.$eval('#catalogReconcileConfirmed',x=>x.checked),true);assert.equal(posts.length,0);
 await page.evaluate(()=>new Promise(resolve=>{let previous='',stable=0;function check(){const r=document.getElementById('catalogReconciliationPanel').getBoundingClientRect(),next=[r.x,r.y,r.width,r.height].join(',');stable=next===previous?stable+1:0;previous=next;if(stable>=24)resolve();else requestAnimationFrame(check);}check();}));
 await page.$eval('#catalogReconciliationPanel',x=>x.scrollIntoView({block:'center',inline:'nearest'}));
 console.log('AR_PANEL',await page.$eval('#catalogReconciliationPanel',x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scrollWidth:x.scrollWidth,clientWidth:x.clientWidth};}));
 await (await page.$('#catalogReconciliationPanel')).screenshot({path:out+'/owner-confirm-ar.png'});
 await page.click('#confirmCatalogInventory');await page.waitForFunction(()=>document.getElementById('catalogReconcileConfirmed').checked===false);assert.equal(posts.length,1);assert.equal(await page.$eval('#confirmCatalogInventory',x=>x.disabled),true);
 assert.match(await page.$eval('#catalogReconciliationFeedback',x=>x.textContent),/تغير/);
 await page.click('#catalogReconciliationProducts button');await page.waitForFunction(()=>!document.getElementById('catalogSellableQuantity').disabled);assert.equal(previews,2);assert.equal(await page.$eval('#catalogSellableQuantity',x=>x.value),'');
 await page.type('#catalogSellableQuantity','8');await page.click('#catalogReconcileConfirmed');fail=false;await page.click('#confirmCatalogInventory');await page.waitForFunction(()=>document.getElementById('catalogReconciliationForm').hidden);assert.equal(posts.length,2);
 for(const body of posts)assert.deepEqual(body,{confirm:true,expectedSourceKey:preview.sourceKey,expectedRemoteQuantity:10,sellableQuantity:8});
 assert.match(await page.$eval('#catalogReconciliationFeedback',x=>x.textContent),/8/);await (await page.$('#catalogReconciliationPanel')).screenshot({path:out+'/owner-confirm-success.png'});
 await page.click('#syncStoreCatalog');await page.waitForFunction(()=>document.getElementById('storeConnectorFeedback').textContent.includes('طلبات المحادثة القديمة'));
 await (await page.$('#storeConnectorForm')).evaluateHandle(x=>x.closest('.glass-card')).then(x=>x.asElement().screenshot({path:out+'/connector-blocker-ar.png'}));
 console.log('CATALOG_RECONCILIATION_BROWSER_PASS',out);
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
