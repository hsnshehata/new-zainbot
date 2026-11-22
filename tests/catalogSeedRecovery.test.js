'use strict';
process.env.NODE_ENV='test';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const Product=require('../server/models/Product');const Store=require('../server/models/Store');const Bot=require('../server/models/Bot');const {importCatalog}=require('../server/services/catalogImportService');
test('expired inert seed is safely adopted by the replacement source, never treated as published inventory',async()=>{
 const db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('seed-lease-review'));
 try{
  await Product.init();const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Seed lease review',storeLink:'seed-review',templateId:1,userId});const bot=await Bot.create({userId,name:'Seed review',storeId:store._id});
  const leaseUntil=new Date(Date.now()+100);const config={botId:bot._id,storeId:store._id,provider:'woocommerce',origin:'https://old-source.invalid',currency:'EGP',syncGeneration:1,leaseUntil};
  const remote={id:17,name:'Synthetic seed product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'};const request=async()=>({body:[remote],headers:{'x-wp-totalpages':'1'}});
  const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{if(update.$setOnInsert)await new Promise(r=>setTimeout(r,150));return Product.updateOne(filter,update,options);}};
  await assert.rejects(importCatalog(config,{},{request,productModel:model,isCurrent:async()=>Date.now()<leaseUntil.getTime()}),{code:'STALE_CATALOG_SYNC'});
  const seeded=await Product.findOne({storeId:store._id});console.log('STALE_SEED',JSON.stringify({exists:Boolean(seeded),active:seeded?.isActive,generation:seeded?.catalogInventory?.syncGeneration,source:seeded?.catalogInventory?.sourceKey}));
  let freshError;try{await importCatalog({...config,leaseUntil:new Date(Date.now()+10000),syncGeneration:2,origin:'https://replacement-source.invalid'},{},{request});}catch(error){freshError=error.code;}
  console.log('REPLACEMENT_RESULT',freshError);assert.ok(seeded);assert.equal(seeded.isActive,false);assert.equal(seeded.stock,0);assert.equal(seeded.catalogInventory.syncGeneration,0);assert.equal(seeded.catalogInventory.localAllocated,0);assert.equal(freshError,undefined);
  const replacement=await Product.findById(seeded._id);assert.equal(replacement.isActive,true);assert.equal(replacement.stock,10);assert.equal(replacement.catalogInventory.syncGeneration,2);assert.match(replacement.catalogInventory.sourceKey,/replacement-source/);
 }finally{await mongoose.disconnect();await db.stop();}
});

async function inDatabase(name, run) {
 const db=await MongoMemoryServer.create();await mongoose.connect(db.getUri(name));
 try{await Product.init();await run();}finally{await mongoose.disconnect();await db.stop();}
}
let serial=0;
async function seedFixture(provider='woocommerce',{createSeed=true}={}) {
 const {mapProduct,sourceKey}=require('../server/services/catalogImportService');
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Seed recovery '+(++serial),storeLink:'seed-recovery-'+serial,templateId:1,userId});const bot=await Bot.create({userId,name:'Seed recovery bot',storeId:store._id});
 const origin=provider==='shopify'?'https://old.myshopify.com':'https://old.invalid';
 const config={botId:bot._id,storeId:store._id,provider,origin,currency:'EGP',syncGeneration:2,leaseUntil:new Date(Date.now()+60000)};
 const remote=provider==='woocommerce'?{id:17,name:'Synthetic seed',price:'100',stock_quantity:10,manage_stock:true,status:'publish'}:{id:17,title:'Synthetic seed',status:'active',variants:[{id:99,price:'100',inventory_quantity:10,inventory_management:'shopify'}]};
 const mapped=mapProduct(remote,provider,'EGP');const oldKey=sourceKey(config,mapped);
 const data={...mapped,storeId:store._id,isActive:false,stock:0,catalogInventory:{sourceKey:oldKey,remoteQuantity:10,localAllocated:0,syncGeneration:0}};
 const seed=createSeed?await Product.create(data):null;
 const fresh={...config,origin:provider==='shopify'?'https://replacement.myshopify.com':'https://replacement.invalid'};
 const request=async()=>({body:provider==='shopify'?{products:[remote]}:[remote],headers:provider==='shopify'?{}:{'x-wp-totalpages':'1'}});
 return {seed,store,config,fresh,data,oldKey,newKey:sourceKey(fresh,mapped),request};
}
test('fresh import adopts a stale seed inserted after its preflight for either provider',async()=>inDatabase('late-seed',async()=>{
 for(const provider of ['woocommerce','shopify']){
  const f=await seedFixture(provider,{createSeed:false});let injected=false;
  const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{
   if(update.$setOnInsert&&!injected){injected=true;await Product.create(f.data);}
   return Product.updateOne(filter,update,options);
  }};
  await importCatalog(f.fresh,{},{request:f.request,productModel:model});
  const after=await Product.findOne({storeId:f.store._id});assert.equal(after.catalogInventory.sourceKey,f.newKey);assert.equal(after.stock,10);assert.equal(after.catalogInventory.localAllocated,0);assert.equal(after.catalogInventory.syncGeneration,2);
 }
}));
test('source rebind refuses published, allocated, active, sold, tokened and order-referenced records',async()=>inDatabase('seed-refusal',async()=>{
 const cases=[['published',{'catalogInventory.syncGeneration':1}],['allocated',{'catalogInventory.localAllocated':1}],['stock',{stock:1}],['active',{isActive:true}],['sold',{salesCount:1}],['reserved',{reservations:[{orderId:new mongoose.Types.ObjectId(),qty:1}]}],['restored',{restorations:[{orderId:new mongoose.Types.ObjectId(),qty:1,epoch:'synthetic'}]}],['order-reference',{}]];
 for(const [kind,fields]of cases){
  const f=await seedFixture();await Product.updateOne({_id:f.seed._id},{$set:fields});
  if(kind==='order-reference')await require('../server/models/Order').create({storeId:f.store._id,products:[{productId:f.seed._id,quantity:1,price:100}],totalPrice:100,paymentMethod:'whatsapp_confirmation',status:'cancelled'});
  await assert.rejects(importCatalog(f.fresh,{},{request:f.request}),{code:'CATALOG_SOURCE_CHANGED'},kind);
  assert.equal((await Product.findById(f.seed._id)).catalogInventory.sourceKey,f.oldKey,kind);
 }
}));
test('publication or allocation between eligibility read and rebind CAS cannot be overwritten',async()=>inDatabase('seed-cas-race',async()=>{
 const f=await seedFixture();let raced=false;
 const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{
  if(update.$set?.['catalogInventory.sourceKey']&&!raced){raced=true;await Product.updateOne({_id:f.seed._id},{$set:{'catalogInventory.syncGeneration':1,'catalogInventory.localAllocated':2,stock:8,isActive:true}});}
  return Product.updateOne(filter,update,options);
 }};
 await assert.rejects(importCatalog(f.fresh,{},{request:f.request,productModel:model}),{code:'CATALOG_SOURCE_CHANGED'});
 const after=await Product.findById(f.seed._id);assert.equal(after.stock,8);assert.equal(after.catalogInventory.localAllocated,2);assert.equal(after.catalogInventory.syncGeneration,1);assert.equal(after.catalogInventory.sourceKey,f.oldKey);
}));
test('rebind CAS has a Mongo-time expiry fence even when application checks stay true',async()=>inDatabase('seed-cas-expiry',async()=>{
 const f=await seedFixture();const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{
  if(update.$set?.['catalogInventory.sourceKey'])await new Promise(r=>setTimeout(r,150));
  return Product.updateOne(filter,update,options);
 }};
 await assert.rejects(importCatalog({...f.fresh,leaseUntil:new Date(Date.now()+100)},{},{request:f.request,productModel:model,isCurrent:async()=>true}),{code:'STALE_CATALOG_SYNC'});
 const after=await Product.findById(f.seed._id);assert.equal(after.catalogInventory.sourceKey,f.oldKey);assert.equal(after.catalogInventory.syncGeneration,0);assert.equal(after.isActive,false);assert.equal(after.stock,0);
}));
