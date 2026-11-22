'use strict';
// Local real-app storefront proof, synthetic Mongo only and external requests
// blocked. Unknown quantity is not described as confirmed out-of-stock.
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-inventory-browser-secret-32';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION=process.env.MONGOMS_VERSION||'7.0.24';
const assert=require('node:assert/strict');const fs=require('node:fs');const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');const puppeteer=require('puppeteer');
(async()=>{let db,server,browser;try{
 db=await MongoMemoryServer.create();process.env.MONGODB_URI=db.getUri('catalog-notice-browser');await mongoose.connect(process.env.MONGODB_URI);
 const app=require('../../server/server');server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}`;
 const Store=require('../../server/models/Store');const Product=require('../../server/models/Product');
 const store=await Store.create({storeName:'متجر اختبار المخزون',storeLink:'synthetic-inventory',templateId:1,userId:new mongoose.Types.ObjectId(),adminConfig:{enableCart:true,landingLayout:'layout1'}});
 const product=await Product.create({storeId:store._id,productName:'منتج بكمية غير مؤكدة',description:'اختبار محلي فقط',price:100,currency:'EGP',stock:0,stockTracked:false,importSource:'woocommerce',importSourceId:'17',catalogInventory:{sourceKey:'synthetic',remoteQuantity:0,localAllocated:0,syncGeneration:1}});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const out=process.env.QA_EVIDENCE_DIR||'/tmp/catalog-notice-evidence';fs.mkdirSync(out,{recursive:true});
 for(const layout of ['layout1','layout2','layout3']){
  await Store.updateOne({_id:store._id},{$set:{'adminConfig.landingLayout':layout}});const page=await browser.newPage();await page.setViewport({width:390,height:844});await page.setBypassServiceWorker(true);await page.setCacheEnabled(false);const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await page.setRequestInterception(true);page.on('request',r=>(r.url().startsWith(base)||r.url().startsWith('data:'))?r.continue():r.abort());
  await page.goto(`${base}/store/synthetic-inventory/landing?product=${product._id}`,{waitUntil:'networkidle0'});await page.waitForSelector('.product-detail-backdrop .inventory-notice');
  const notice=await page.$eval('.inventory-notice',x=>x.textContent);assert.match(notice,/الكمية غير مؤكدة/);assert.doesNotMatch(notice,/Quantity is unconfirmed/);
  await page.screenshot({path:`${out}/${layout}-unconfirmed-quantity.png`,fullPage:true});await page.click('.product-detail-backdrop [data-add]');assert.equal(dialogs.length,1);assert.match(dialogs[0],/الكمية غير مؤكدة/);assert.doesNotMatch(dialogs[0],/Quantity is unconfirmed/);
  const cart=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),`zain_cart_${store._id}`);assert.deepEqual(cart,{});
  if(await page.$('.product-detail-backdrop .close'))await page.click('.product-detail-backdrop .close');
  await page.evaluate(layout=>{document.documentElement.lang='en';window.StoreLandingTemplates[layout].showProduct(window.__ALL_PRODUCTS__[0]);},layout);
  await page.waitForSelector('.inventory-notice');const english=await page.$eval('.inventory-notice',x=>x.textContent);assert.equal(await page.$eval('.inventory-notice',x=>x.dir),'auto');assert.match(english,/Quantity is unconfirmed/);assert.doesNotMatch(english,/الكمية غير مؤكدة/);
  await page.screenshot({path:`${out}/${layout}-unconfirmed-quantity-en.png`,fullPage:true});await page.click('.product-detail-backdrop [data-add]');assert.equal(dialogs.length,2);assert.match(dialogs[1],/Quantity is unconfirmed/);assert.doesNotMatch(dialogs[1],/الكمية غير مؤكدة/);
  await page.close();console.log('CATALOG_NOTICE_PASS',layout);
 }
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
