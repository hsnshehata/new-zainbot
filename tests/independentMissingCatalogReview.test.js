'use strict';
process.env.NODE_ENV='test';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const Product=require('../server/models/Product');const Store=require('../server/models/Store');const {importCatalog}=require('../server/services/catalogImportService');const stock=require('../server/services/stockService');
test('PROBE: a successful complete remote snapshot excludes a deleted product from local checkout',async()=>{
 const db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('missing-product-review'));
 try{
  const store=await Store.create({storeName:'Missing catalog review',storeLink:'missing-review',templateId:1,userId:new mongoose.Types.ObjectId()});
  const config={provider:'woocommerce',origin:'https://review.invalid',storeId:store._id,currency:'EGP',syncGeneration:1};
  let items=[{id:17,name:'Synthetic removed product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'}];
  const request=async()=>({body:items,headers:{'x-wp-totalpages':'1'}});
  await importCatalog(config,{},{request});const old=await Product.findOne({storeId:store._id,importSourceId:'17'});
  items=[{id:18,name:'Synthetic remaining product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'}];
  const count=await importCatalog({...config,syncGeneration:2},{},{request});
  const result=await stock.reserveLine(old._id,store._id,new mongoose.Types.ObjectId(),1);const after=await Product.findById(old._id);
  console.log('MISSING_REMOTE',JSON.stringify({importedCount:count,active:after.isActive,available:after.stock,reserved:result.ok,generation:after.catalogInventory.syncGeneration}));
  assert.equal(result.ok,false,'a source-deleted product must not remain locally reservable after successful full sync');
 }finally{await mongoose.disconnect();await db.stop();}
});
