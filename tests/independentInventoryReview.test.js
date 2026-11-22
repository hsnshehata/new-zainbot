'use strict';
process.env.NODE_ENV='test';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');
const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const Product=require('../server/models/Product');const Store=require('../server/models/Store');
const {importCatalog}=require('../server/services/catalogImportService');const stock=require('../server/services/stockService');
const controller=require('../server/controllers/productController');
let db,serial=0;
test.before(async()=>{db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('independent-review'));await Product.init();});
test.after(async()=>{await mongoose.disconnect();await db.stop();});
function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
async function fixture(){
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Review '+(++serial),storeLink:'review-'+serial,templateId:1,userId,currency:'EGP'});
 const config={provider:'woocommerce',origin:'https://review.invalid',storeId:store._id,currency:'EGP',syncGeneration:1};
 const remote={id:17,name:'Review synthetic product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'};
 const request=async()=>({body:[remote],headers:{'x-wp-totalpages':'1'}});
 const get=()=>Product.findOne({storeId:store._id,importSource:'woocommerce',importSourceId:'17'});
 await importCatalog(config,{},{request});return {userId,store,config,remote,request,get};
}
test('PROBE: deleting a locally allocated import then resyncing does not forget local sales',async()=>{
 const f=await fixture();let p=await f.get();const orderId=new mongoose.Types.ObjectId();await stock.reserveLine(p._id,f.store._id,orderId,2);await stock.pullOrderTokens(orderId);
 const r=response();await controller.deleteProduct({params:{storeId:String(f.store._id),productId:String(p._id)},user:{userId:f.userId,role:'user'}},r);
 assert.equal(r.statusCode,200);await importCatalog({...f.config,syncGeneration:2},{},{request:f.request});p=await f.get();
 console.log('DELETE_RESYNC',JSON.stringify({available:p.stock,allocated:p.catalogInventory.localAllocated}));
 assert.equal(p.stock,8,'two durable local sales must not become saleable again');
});
test('PROBE: lease loss after current check cannot publish an older snapshot',async()=>{
 const f=await fixture();let current=true;let calls=0;
 const model={findOne:(...args)=>Product.findOne(...args),updateOne:async(filter,update,options)=>{
  if(update.$setOnInsert){current=false;}
  return Product.updateOne(filter,update,options);
 }};
 f.remote.stock_quantity=20;
 await assert.rejects(importCatalog({...f.config,syncGeneration:2},{},{request:f.request,productModel:model,isCurrent:async()=>{calls++;return current;}}),{code:'STALE_CATALOG_SYNC'});
 const p=await f.get();console.log('LEASE_GAP',JSON.stringify({available:p.stock,generation:p.catalogInventory.syncGeneration,calls}));
 assert.equal(p.stock,10,'a rejected expired sync must not publish its snapshot');
});
test('PROBE: same-stock metadata edit preserves a concurrent reservation',async()=>{
 const f=await fixture();const p=await f.get();const original=Product.prototype.save;let intercepted=false;
 Product.prototype.save=async function(...args){if(String(this._id)===String(p._id)&&!intercepted){intercepted=true;await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),2);}return original.apply(this,args);};
 try{const r=response();await controller.updateProduct({params:{storeId:String(f.store._id),productId:String(p._id)},user:{userId:f.userId,role:'user'},body:{productName:'Edited synthetic product',stock:10}},r);assert.equal(r.statusCode,200);const after=await f.get();console.log('SAME_STOCK_EDIT',JSON.stringify({available:after.stock,allocated:after.catalogInventory.localAllocated}));assert.equal(after.stock,8);}finally{Product.prototype.save=original;}
});
