'use strict';
process.env.NODE_ENV='test';process.env.MONGOMS_VERSION=process.env.MONGOMS_VERSION||'7.0.24';
process.env.JWT_SECRET='synthetic-local-http-jwt-secret-at-least-32';process.env.CREDENTIAL_ENCRYPTION_KEY=`base64:${Buffer.alloc(32,7).toString('base64')}`;
const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const User=require('../server/models/User');const Bot=require('../server/models/Bot');const Store=require('../server/models/Store');const Connector=require('../server/models/CatalogConnector');const Product=require('../server/models/Product');
const {encryptCredentialSecret,buildCredentialContext}=require('../server/services/AiCredentialCrypto');const {signAccessToken}=require('../server/utils/authTokens');
let mode='ok',calls=0,db,server,base,owner,foreign,admin,bot,store,connector,product;
const actualImport=require('../server/services/catalogImportService');
require.cache[require.resolve('../server/services/catalogImportService')].exports={...actualImport,importCatalog:async(doc,credentials,{isCurrent})=>{
 calls++;assert.equal(credentials.consumerKey,'synthetic-key');assert.equal(credentials.consumerSecret,'synthetic-secret');assert.ok(doc.syncGeneration>0);
 if(mode==='chat-busy'||mode==='chat-open')throw actualImport.connectorError(mode==='chat-busy'?'CATALOG_CHAT_WRITES_ACTIVE':'CATALOG_OPEN_CHAT_ORDERS');
 if(mode==='stale'){
  await Connector.updateOne({_id:doc._id},{$inc:{syncGeneration:1},$set:{state:'running',leaseUntil:new Date(Date.now()+600000)}});
  assert.equal(await isCurrent(),false);throw actualImport.connectorError('STALE_CATALOG_SYNC');
 }
 if(mode==='expired'){
  await Connector.updateOne({_id:doc._id},{$set:{leaseUntil:new Date(Date.now()-1000)}});
  assert.equal(await isCurrent(),false);throw actualImport.connectorError('STALE_CATALOG_SYNC');
 }
 assert.equal(await isCurrent(),true);return 1;
}};
const recoveryId=require.resolve('../server/services/catalogInventoryReconciliation');require.cache[recoveryId]={id:recoveryId,filename:recoveryId,loaded:true,exports:{
 previewCatalogInventory:async()=>{calls++;return {remoteQuantity:10,requiresPhysicalSellableCount:true};},
 reconcileCatalogInventory:async(doc,_credentials,pid,_body,{isCurrent})=>{calls++;assert.equal(await isCurrent(),true);return {productId:pid,remoteQuantity:10,sellableQuantity:8};},
}};
const engineId=require.resolve('../server/botEngine');require.cache[engineId]={id:engineId,filename:engineId,loaded:true,exports:{invalidateStoreCache(){}}};
const router=require('../server/routes/catalogConnectors');
test.before(async()=>{
 db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('catalog-route-local'));
 owner=await User.create({username:'synthetic_owner',email:'owner@synthetic.invalid',isVerified:true});foreign=await User.create({username:'synthetic_foreign',email:'foreign@synthetic.invalid',isVerified:true});admin=await User.create({username:'synthetic_admin',email:'admin@synthetic.invalid',role:'superadmin',isVerified:true});
 bot=await Bot.create({name:'Synthetic inventory',userId:owner._id});store=await Store.create({storeName:'Synthetic route store',storeLink:'synthetic-route',templateId:1,userId:owner._id,botId:bot._id});bot.storeId=store._id;await bot.save();
 connector=await Connector.create({botId:bot._id,storeId:store._id,provider:'woocommerce',origin:'https://synthetic.invalid',currency:'EGP',consumerKey:encryptCredentialSecret('synthetic-key',{context:buildCredentialContext(String(bot._id),'catalog-woo-key')}),consumerSecret:encryptCredentialSecret('synthetic-secret',{context:buildCredentialContext(String(bot._id),'catalog-woo-secret')})});
 product=await Product.create({storeId:store._id,productName:'Synthetic legacy',price:100,currency:'EGP',stock:8,importSource:'woocommerce',importSourceId:'17'});
 const app=express();app.use(express.json());app.use('/api/catalog-connectors',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});base=`http://127.0.0.1:${server.address().port}/api/catalog-connectors/bots/${bot._id}/woocommerce`;
});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();});
async function req(path,method='GET',user=owner,body){const r=await fetch(base+path,{method,headers:{...(user?{Authorization:`Bearer ${signAccessToken(user)}`}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
test('recovery discovery, preview and confirm require real authenticated ownership',async()=>{
 for(const [path,method]of [['/reconciliation','GET'],[`/reconcile/${product._id}`,'GET'],[`/reconcile/${product._id}`,'POST']]){
  const before=calls;assert.equal((await req(path,method,null)).status,401);assert.equal((await req(path,method,foreign)).status,404);assert.equal((await req(path,method,admin)).status,404);assert.equal(calls,before);
 }
});
test('owner discovery returns only matching legacy SKU; preview is read-only',async()=>{
 const list=await req('/reconciliation');assert.equal(list.status,200);assert.deepEqual(list.body.products.map(p=>p._id),[String(product._id)]);
 const prior=(await Connector.findById(connector._id)).syncGeneration;const preview=await req(`/reconcile/${product._id}`);assert.equal(preview.body.remoteQuantity,10);assert.equal((await Connector.findById(connector._id)).syncGeneration,prior);
 assert.doesNotMatch(JSON.stringify(preview.body),/synthetic-key|synthetic-secret|Ciphertext/);
});
test('successful sync claims generation and status completion; no secret in response',async()=>{
 const result=await req('/sync','POST');assert.equal(result.status,200);assert.equal(result.body.state,'succeeded');const after=await Connector.findById(connector._id);assert.equal(after.syncGeneration,1);assert.equal(after.state,'succeeded');assert.equal(after.lastImportedCount,1);
 assert.doesNotMatch(JSON.stringify(result.body),/synthetic-key|synthetic-secret|Ciphertext/);
});
test('old sync cannot finish/fail a newer generation after losing its lease',async()=>{
 mode='stale';const result=await req('/sync','POST');assert.equal(result.status,409);assert.equal(result.body.error,'STALE_CATALOG_SYNC');const after=await Connector.findById(connector._id);assert.equal(after.state,'running');assert.equal(after.syncGeneration,3);mode='ok';await Connector.updateOne({_id:connector._id},{$set:{state:'idle'},$unset:{leaseUntil:''}});
});
test('expired lease does not remain current just because no successor has written',async()=>{
 mode='expired';const result=await req('/sync','POST');assert.equal(result.status,409);assert.equal(result.body.error,'STALE_CATALOG_SYNC');const visible=await req('');assert.equal(visible.body.state,'failed');assert.equal(visible.body.lastError,'STALE_CATALOG_SYNC');mode='ok';
});
test('recovery confirm reuses owner and connector lease gates',async()=>{
 const result=await req(`/reconcile/${product._id}`,'POST',owner,{confirm:true});assert.equal(result.status,200);assert.equal(result.body.state,'reconciled');assert.equal(result.body.statusRefreshRequired,false);
 const after=await Connector.findById(connector._id);assert.equal(after.state,'idle');assert.equal(after.syncGeneration,5);
});
test('impersonated request is rejected before any source/recovery service',async()=>{
 const middleware=router.stack.find(x=>x.name==='owner').handle;let status,body;let next=false;
 await middleware({auth:{isImpersonating:true},params:{provider:'woocommerce'}},{status(c){status=c;return this;},json(v){body=v;return this;}},()=>{next=true;});assert.equal(status,403);assert.equal(body.error,'OWNER_ONLY');assert.equal(next,false);
});
test('database lease blocks config and sync even when application clock says expired',async()=>{
 await Connector.updateOne({_id:connector._id},{$set:{state:'running',leaseUntil:new Date(Date.now()+600000)}});
 const original=Date.now;Date.now=()=>original()+3600000;
 try{
  const body={origin:'https://different.invalid',currency:'EGP',consumerKey:'synthetic-new-key',consumerSecret:'synthetic-new-secret'};
  assert.equal((await req('','PUT',owner,body)).status,409);assert.equal((await req('/sync','POST')).status,409);
  assert.equal((await Connector.findById(connector._id)).origin,'https://synthetic.invalid');
 }finally{Date.now=original;await Connector.updateOne({_id:connector._id},{$set:{state:'idle'},$unset:{leaseUntil:''}});}
});
test('fresh-config race cannot upsert over a concurrently claimed connector',async()=>{
 await Connector.updateOne({_id:connector._id},{$set:{state:'running',leaseUntil:new Date(Date.now()+600000)}});
 const original=Connector.findOne;Connector.findOne=async()=>null;
 try{assert.equal((await req('','PUT',owner,{origin:'https://different.invalid',currency:'EGP',consumerKey:'synthetic-new-key',consumerSecret:'synthetic-new-secret'})).status,409);}
 finally{Connector.findOne=original;}
 assert.equal((await Connector.findById(connector._id)).origin,'https://synthetic.invalid');
});

test('HTTP sync reports actionable chat quiescence and legacy obligation blockers',async()=>{
 await Connector.updateOne({_id:connector._id},{$set:{state:'idle'},$unset:{leaseUntil:''}});
 try{for(const [next,code]of [['chat-busy','CATALOG_CHAT_WRITES_ACTIVE'],['chat-open','CATALOG_OPEN_CHAT_ORDERS']]){
  mode=next;const result=await req('/sync','POST');assert.equal(result.status,409);assert.equal(result.body.error,code);
 }}finally{mode='ok';}
});
