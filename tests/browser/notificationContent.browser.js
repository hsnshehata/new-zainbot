'use strict';
// Local rendering proof only, not a Telegram/WhatsApp client acceptance test.
// Calls actual exported formatters. No dispatch functions or provider calls.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const puppeteer=require('puppeteer');
const {formatOrderNotificationMessage,formatBookingNotificationMessage,formatComplaintNotificationMessage,formatDailyDigestNotificationMessage}=require('../../server/services/notificationDispatcher');
(async()=>{let browser;try{
 const raw='حسن <b>خاص</b> & "quoted" &lt;literal&gt;';
 const input={customerName:raw,customerPhone:'01000000000',customerAddress:raw,serviceType:raw,notes:raw,message:raw,items:[{title:raw,quantity:2,price:100,currency:'EGP'}],currency:'EGP',total:200,revenue:200,conversationsCount:2,ordersCount:1};
 const messages=[formatOrderNotificationMessage,formatBookingNotificationMessage,formatComplaintNotificationMessage,formatDailyDigestNotificationMessage].map(fn=>fn(input,raw));
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',req=>req.abort());await page.setViewport({width:720,height:1400});
 await page.setContent('<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}html{direction:ltr}body{font:17px Arial;background:#e9eef4;margin:20px}main{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:20px}section{direction:rtl;min-width:0;overflow-wrap:anywhere;background:white;white-space:pre-wrap;padding:20px;border-radius:16px;line-height:1.8}h1{font-size:20px;direction:ltr;text-align:left;overflow-wrap:anywhere}</style><h1>Local synthetic notification formatting, not a live channel</h1><main></main></html>');
 await page.evaluate(messages=>{const root=document.querySelector('main');for(const text of messages){const section=document.createElement('section');section.innerHTML=text;root.appendChild(section);}},messages);
 const results=await page.$$eval('section',els=>els.map(e=>({text:e.textContent,tags:[...e.querySelectorAll('*')].map(x=>x.tagName)})));
 for(const r of results){assert.ok(r.text.includes(raw));assert.ok(r.tags.every(t=>t==='B'));}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'preview fits viewport');
 const out=process.env.QA_EVIDENCE_DIR||'/tmp/notification-evidence';fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'notification-literal-preview.png'),fullPage:true});console.log('NOTIFICATION_CONTENT_BROWSER_PASS');
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
