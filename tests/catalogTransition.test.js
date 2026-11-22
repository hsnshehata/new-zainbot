'use strict';
process.env.NODE_ENV='test';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';process.env.APP_URL='https://review.invalid';
const test=require('node:test');const assert=require('node:assert/strict');const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
require('../server/services/notificationDispatcher').dispatchMultiChannelNotification=async()=>{};const telegram=require('../server/services/telegramService');telegram.notifyChatOrder=async()=>{};telegram.notifyOrderStatus=async()=>{};
const Product=require('../server/models/Product');const Store=require('../server/models/Store');const Bot=require('../server/models/Bot');const ChatOrder=require('../server/models/ChatOrder');
const {importCatalog}=require('../server/services/catalogImportService');const controller=require('../server/controllers/chatOrdersController');
let db,serial=0;test.before(async()=>{db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('v2-adversarial'));await Product.init();});test.after(async()=>{await mongoose.disconnect();await db.stop();});
function res(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
async function fixture(provider='shopify'){
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'V2 review '+(++serial),storeLink:'v2-review-'+serial,templateId:1,userId});const bot=await Bot.create({userId,name:'V2 review bot',storeId:store._id});
 const config={botId:bot._id,provider,origin:provider==='shopify'?'https://review.myshopify.com':'https://review.invalid',storeId:store._id,currency:'EGP',syncGeneration:1};
 const remote=id=>provider==='shopify'?{id,title:'Synthetic item '+id,status:'active',variants:[{id:99,price:'100',inventory_quantity:10,inventory_management:'shopify'}]}:{id,name:'Synthetic item '+id,price:'100',stock_quantity:10,manage_stock:true,status:'publish'};
 const request=async()=>({body:provider==='shopify'?{products:[remote(17)]}:[remote(17)],headers:provider==='shopify'?{}:{'x-wp-totalpages':'1'}});
 return {userId,store,bot,config,remote,request};
}
for(const provider of ['shopify','woocommerce'])test('PROBE V2: malformed pagination cannot retire valid rows for '+provider,async()=>{
 const f=await fixture(provider);await importCatalog(f.config,{},{request:f.request});const before=await Product.findOne({storeId:f.store._id,importSourceId:'17'});
 const malformed=async()=>({body:provider==='shopify'?{products:[f.remote(18)]}:[f.remote(18)],headers:provider==='shopify'?{link:'<https://review.myshopify.com/admin/api/2026-07/products.json?page_info=abc&limit=100>; rel=next'}:{'x-wp-totalpages':'0'}});
 let rejected=false;try{await importCatalog({...f.config,syncGeneration:2},{},{request:malformed});}catch{rejected=true;}
 const after=await Product.findById(before._id);console.log('INVALID_PAGINATION',JSON.stringify({provider,rejected,active:after.isActive,stock:after.stock,generation:after.catalogInventory.syncGeneration}));
 assert.equal(rejected,true,'invalid pagination must not be accepted as a complete snapshot');assert.equal(after.isActive,true);
});
test('PROBE V2: cancelling imported chat order cannot edit its item ledger or totals',async()=>{
 const f=await fixture();await importCatalog(f.config,{},{request:f.request});const order=await ChatOrder.create({botId:f.bot._id,channel:'web',sourceUserId:'review-cancel',items:[{title:'Synthetic item 17',quantity:2,price:100}],totalAmount:200,status:'confirmed'});
 const response=res();await controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{status:'cancelled',items:[{title:'Different item',quantity:999,price:123}],totalAmount:122877,deliveryFee:50}},response);
 const after=await ChatOrder.findById(order._id);console.log('CANCEL_EDIT',JSON.stringify({status:response.statusCode,orderStatus:after.status,title:after.items[0].title,total:after.totalAmount}));
 assert.equal(after.items[0].title,'Synthetic item 17','cancellation allowance must not also permit arbitrary item changes');assert.equal(after.totalAmount,200);
});
test('first activation refuses in-flight chat writes, then requires legacy orders to settle',async()=>{
 const f=await fixture();const original=ChatOrder.create;let entered,release;const gate=new Promise(r=>{entered=r;});
 ChatOrder.create=async function(...args){entered();await new Promise(r=>{release=r;});return original.apply(this,args);};
 let pending;
 try{
  pending=controller.createOrUpdateFromExtraction({botId:f.bot._id,channel:'web',conversationId:new mongoose.Types.ObjectId(),sourceUserId:'inflight-review',customerName:'Synthetic customer',customerPhone:'01012345678',customerAddress:'Synthetic address',items:[{title:'Synthetic item 17',quantity:2,price:100}],status:'confirmed'});
  await gate;
  await assert.rejects(importCatalog(f.config,{},{request:f.request}),{code:'CATALOG_CHAT_WRITES_ACTIVE'});
  assert.equal(await Product.countDocuments({storeId:f.store._id}),0);
  assert.equal((await Store.findById(f.store._id).select('+catalogInventoryMode +catalogChatWrites')).catalogInventoryMode,'local');
  release();const result=await pending;assert.equal(result.saved,true);
  assert.equal((await Store.findById(f.store._id).select('+catalogInventoryMode +catalogChatWrites')).catalogChatWrites.length,0);
  await assert.rejects(importCatalog(f.config,{},{request:f.request}),{code:'CATALOG_OPEN_CHAT_ORDERS'});
  assert.equal((await Store.findById(f.store._id).select('+catalogInventoryMode +catalogChatWrites')).catalogInventoryMode,'transitioning');
  const cancelled=res();await controller.updateOrder({params:{id:String(result.order._id)},user:{userId:f.userId,role:'user'},body:{status:'cancelled'}},cancelled);assert.equal(cancelled.statusCode,200);
  await importCatalog({...f.config,syncGeneration:2},{},{request:f.request});
  assert.equal((await Store.findById(f.store._id).select('+catalogInventoryMode +catalogChatWrites')).catalogInventoryMode,'imported');
  const blocked=await controller.createOrUpdateFromExtraction({botId:f.bot._id,channel:'web',sourceUserId:'after-transition',items:[{title:'Synthetic item 17',quantity:2,price:100}],status:'confirmed'});assert.equal(blocked.saved,false);
 }finally{ChatOrder.create=original;if(release)release();if(pending)await pending;}
});
test('store guard blocks activation until an existing native chat update is durable',async()=>{
 const f=await fixture();const order=await ChatOrder.create({botId:f.bot._id,channel:'web',sourceUserId:'native-edit',items:[{title:'Native',price:100,quantity:1}],totalAmount:100,status:'processing'});
 const original=ChatOrder.prototype.save;let entered,release;const gate=new Promise(r=>{entered=r;});
 ChatOrder.prototype.save=async function(...args){if(String(this._id)===String(order._id)){entered();await new Promise(r=>{release=r;});}return original.apply(this,args);};
 let pending;
 try{
  const response=res();pending=controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{items:[{title:'Native',price:100,quantity:2}],totalAmount:200}},response);
  await gate;await assert.rejects(importCatalog(f.config,{},{request:f.request}),{code:'CATALOG_CHAT_WRITES_ACTIVE'});assert.equal(await Product.countDocuments({storeId:f.store._id}),0);
  release();await pending;assert.equal(response.statusCode,200);assert.equal((await ChatOrder.findById(order._id)).totalAmount,200);
 }finally{ChatOrder.prototype.save=original;if(release)release();if(pending)await pending;}
});
test('cancellation status-only does not recalculate zero totals or restore inventory',async()=>{
 const f=await fixture();await importCatalog(f.config,{},{request:f.request});
 const order=await ChatOrder.create({botId:f.bot._id,channel:'web',sourceUserId:'zero-total',items:[{title:'Synthetic item 17',quantity:2,price:100}],totalAmount:0,deliveryFee:0,status:'confirmed'});
 const response=res();await controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{status:'cancelled',note:'Synthetic cancellation'}},response);
 assert.equal(response.statusCode,200);const after=await ChatOrder.findById(order._id);assert.equal(after.status,'cancelled');assert.equal(after.totalAmount,0);assert.equal(after.items[0].quantity,2);assert.equal((await Product.findOne({storeId:f.store._id})).stock,10);
});
test('transition exposes no store write-guard data through public store reads',async()=>{
 const f=await fixture();await Store.updateOne({_id:f.store._id},{$set:{catalogInventoryMode:'transitioning',catalogChatWrites:[{id:'synthetic-pending',startedAt:new Date()}]}});
 const response=res();await require('../server/controllers/storeController').getStoreByLink({params:{storeLink:f.store.storeLink}},response);assert.equal(response.statusCode,200);
 const json=JSON.parse(JSON.stringify(response.body));assert.equal('catalogChatWrites' in json,false);assert.equal('catalogInventoryMode' in json,false);
 await assert.rejects(importCatalog(f.config,{},{request:f.request}),{code:'CATALOG_CHAT_WRITES_ACTIVE'});
 assert.equal(await Product.countDocuments({storeId:f.store._id}),0,'a durable guard is not force-cleared by import');
});
test('malformed or contradictory later pages never publish or retire any product',async()=>{
 const f=await fixture('woocommerce');await importCatalog(f.config,{},{request:f.request});
 let calls=0;
 await assert.rejects(importCatalog({...f.config,syncGeneration:2},{},{request:async()=>({body:[f.remote(++calls===1?18:19)],headers:{'x-wp-totalpages':calls===1?'2':'1'}})}),{code:'REMOTE_INVALID_RESPONSE'});
 const old=await Product.findOne({storeId:f.store._id,importSourceId:'17'});assert.equal(old.isActive,true);assert.equal(old.catalogInventory.syncGeneration,1);assert.equal(await Product.countDocuments({storeId:f.store._id}),1);
});
test('Shopify first/last-page relation contradictions fail before publishing or retiring',async()=>{
 const f=await fixture();await importCatalog(f.config,{},{request:f.request});
 const cursor='https://review.myshopify.com/admin/api/2026-07/products.json?page_info=abc&limit=100';
 await assert.rejects(importCatalog({...f.config,syncGeneration:2},{},{request:async()=>({body:{products:[f.remote(18)]},headers:{link:`<${cursor}>; rel="previous"`}})}),{code:'REMOTE_INVALID_RESPONSE'});
 let calls=0;await assert.rejects(importCatalog({...f.config,syncGeneration:3},{},{request:async()=>({body:{products:[f.remote(18+(calls++))]},headers:calls===1?{link:`<${cursor}>; rel="next"`}:{}})}),{code:'REMOTE_INVALID_RESPONSE'});
 const old=await Product.findOne({storeId:f.store._id,importSourceId:'17'});assert.equal(old.isActive,true);assert.equal(await Product.countDocuments({storeId:f.store._id}),1);
});
test('settlement cannot resurrect a cancelled imported chat obligation',async()=>{
 const f=await fixture();await importCatalog(f.config,{},{request:f.request});const order=await ChatOrder.create({botId:f.bot._id,channel:'web',sourceUserId:'old-cancelled',items:[{title:'Synthetic item 17',quantity:1,price:100}],status:'cancelled'});
 const response=res();await controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{status:'shipped'}},response);assert.equal(response.statusCode,409);assert.equal((await ChatOrder.findById(order._id)).status,'cancelled');
});
test('valid Shopify next/previous pagination imports every page before retiring anything',async()=>{
 const f=await fixture();let page=0;const cursor='https://review.myshopify.com/admin/api/2026-07/products.json?page_info=abc&limit=100';
 const count=await importCatalog(f.config,{},{request:async()=>({body:{products:[f.remote(++page===1?17:18)]},headers:{link:`<${cursor}>; rel="${page===1?'next':'previous'}"`}})});
 assert.equal(count,2);assert.equal(await Product.countDocuments({storeId:f.store._id,isActive:true}),2);
});
test('owner may finish an existing imported-store shipment with status only, never altered finances',async()=>{
 const f=await fixture();await importCatalog(f.config,{},{request:f.request});const order=await ChatOrder.create({botId:f.bot._id,channel:'web',sourceUserId:'old-shipping',items:[{title:'Synthetic item 17',quantity:1,price:100}],totalAmount:100,status:'confirmed'});
 let response=res();await controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{status:'shipped',totalAmount:200}},response);assert.equal(response.statusCode,400);assert.equal((await ChatOrder.findById(order._id)).status,'confirmed');
 response=res();await controller.updateOrder({params:{id:String(order._id)},user:{userId:f.userId,role:'user'},body:{status:'shipped'}},response);assert.equal(response.statusCode,200);const after=await ChatOrder.findById(order._id);assert.equal(after.status,'shipped');assert.equal(after.totalAmount,100);
});
