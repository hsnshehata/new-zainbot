'use strict';
// Local static-dashboard fixture. Every API is intercepted. No provider calls,
// production startup, live account access, or persistent database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');
const { matchSmokeApi, SMOKE_TOKENS, SMOKE_BOTS } = require('./fixtures/dashboardApi');
(async () => {
  let server, browser;
  try {
    const app = express();
    app.get('/dashboard', (_q,r) => r.sendFile(path.resolve(__dirname,'../../public/dashboard.html')));
    app.use(express.static(path.resolve(__dirname,'../../public')));
    server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page = await browser.newPage();
    await page.setViewport({width:1440,height:1100});await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(token => {
      localStorage.setItem('token',token); localStorage.setItem('tokenExpiry',String(Date.now()+3600000)); localStorage.setItem('language','en');
    },SMOKE_TOKENS.ORDINARY);
    let uploadOK = false, saves = 0, uploads = 0; const dialogs=[];
    page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
    await page.setRequestInterception(true);
    page.on('request',req=>{
      const u=new URL(req.url());
      if(u.origin!==base) return req.abort();
      if(!u.pathname.startsWith('/api/')) return req.continue();
      let body, status=200;
      if(u.pathname==='/api/upload') {
        uploads++; assert.equal(req.headers().authorization,`Bearer ${SMOKE_TOKENS.ORDINARY}`);
        assert.match(req.headers()['content-type'],/multipart\/form-data; boundary=/);
        status=uploadOK?200:500; body=uploadOK?{imageUrl:base+'/synthetic-logo.png'}:{message:'synthetic failure'};
      } else if(u.pathname==='/api/bots') { body=SMOKE_BOTS;
      } else if(u.pathname.startsWith('/api/chat-page/bot/')) {
        body={success:true,chatPageId:'synthetic-page',title:'Synthetic logo test',linkId:'synthetic-chat',logoUrl:''};
      } else if(u.pathname==='/api/chat-page/synthetic-page'&&req.method()==='PUT') {
        saves++; assert.equal(JSON.parse(req.postData()).logoUrl,base+'/synthetic-logo.png'); body={success:true};
      } else {
        const decision=matchSmokeApi(req.method(),u.pathname+u.search,req.headers().authorization||'',req.postData()||'','ok');
        if(decision&&decision.kind!=='unknown'){ status=decision.status;body=decision.body; }
        else {status=404;body={success:false,message:'Unconfigured local fixture'};}
      }
      return req.respond({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(base+'/dashboard',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>typeof window.openChatPageModal==='function',{timeout:8000});
    await page.evaluate(bot=>window.openChatPageModal(bot),SMOKE_BOTS[0]);
    await page.waitForSelector('#chatPageModal.active',{visible:true,timeout:8000});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDosAAAAASUVORK5CYII=','base64');
    const fixturePath='/tmp/synthetic-logo.png';fs.writeFileSync(fixturePath,png);
    await (await page.$('#chatPageLogoInput')).uploadFile(fixturePath);
    const evidence=process.env.QA_EVIDENCE_DIR||'/tmp/chat-logo-evidence';fs.mkdirSync(evidence,{recursive:true});
    await page.screenshot({path:path.join(evidence,'logo-dialog-before-save.png')});
    await page.click('#chatPageForm button[type=submit]');
    await page.waitForFunction(()=>document.getElementById('chatPageModal').classList.contains('active'));
    await new Promise((resolve,reject)=>{const end=Date.now()+5000;const t=setInterval(()=>{if(dialogs.length){clearInterval(t);resolve();}else if(Date.now()>end){clearInterval(t);reject(Error('No upload dialog: '+uploads+' uploads, '+saves+' saves'));}},20);});
    assert.equal(saves,0);assert.equal(uploads,1);
    assert.match(dialogs[0],/not saved|لم يتم حفظ/);
    assert.equal(await page.$eval('#chatPageModal',el=>el.classList.contains('active')),true);
    await page.screenshot({path:path.join(evidence,'logo-dialog-after-failure.png')});
    uploadOK=true;
    await page.click('#chatPageForm button[type=submit]');
    await page.waitForFunction(()=>!document.getElementById('chatPageModal').classList.contains('active'));
    assert.equal(saves,1);assert.equal(uploads,2);assert.equal(dialogs.length,2);
    assert.match(dialogs[1],/successfully|بنجاح/);
    console.log('CHAT_LOGO_BROWSER_PASS',evidence);
  } finally {if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
