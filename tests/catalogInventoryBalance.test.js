'use strict';
process.env.NODE_ENV='test';process.env.MONGOMS_VERSION=process.env.MONGOMS_VERSION||'7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');
const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const Product=require('../server/models/Product');const Store=require('../server/models/Store');const Order=require('../server/models/Order');
const Supplier=require('../server/models/Supplier');const Invoice=require('../server/models/PurchaseInvoice');
const stock=require('../server/services/stockService');const {importCatalog}=require('../server/services/catalogImportService');
const {previewCatalogInventory,reconcileCatalogInventory}=require('../server/services/catalogInventoryReconciliation');
const ops=require('../server/services/orderOps');const oldNotify=ops.notifyOwnerOfNewOrder;ops.notifyOwnerOfNewOrder=async()=>{};
const orderController=require('../server/controllers/orderController');const supplierController=require('../server/controllers/suppliersController');
const productController=require('../server/controllers/productController');
let db,serial=0;
test.before(async()=>{db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('catalog-inventory-local'));await Product.init();});
test.after(async()=>{ops.notifyOwnerOfNewOrder=oldNotify;await mongoose.disconnect();if(db)await db.stop();});
function res(){return {statusCode:200,status(c){this.statusCode=c;return this;},json(body){this.body=body;return this;}};}
async function fixture(provider){
 const store=await Store.create({storeName:'Synthetic inventory '+(++serial),storeLink:'inv-'+serial,templateId:1,userId:new mongoose.Types.ObjectId(),currency:'EGP'});
 const config={provider,origin:provider==='shopify'?'https://synthetic.myshopify.com':'https://example.invalid',storeId:store._id,currency:'EGP',syncGeneration:0};
 const remote=provider==='woocommerce'?{id:17,name:'Synthetic tracked product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'}:{id:17,title:'Synthetic tracked product',status:'active',variants:[{id:99,price:'100',inventory_quantity:10,inventory_management:'shopify'}]};
 const request=async()=>({body:provider==='woocommerce'?[remote]:{products:[remote]},headers:provider==='woocommerce'?{'x-wp-totalpages':'1'}:{}});
 const setQuantity=q=>{if(provider==='woocommerce')remote.stock_quantity=q;else remote.variants[0].inventory_quantity=q;};
 const setTracked=b=>{if(provider==='woocommerce')remote.manage_stock=b;else remote.variants[0].inventory_management=b?'shopify':null;};
 const sync=async(options={})=>{config.syncGeneration++;return importCatalog({...config},{},{request,...options});};
 const get=()=>Product.findOne({storeId:store._id,importSource:provider,importSourceId:'17'});
 return {store,config,remote,request,setQuantity,setTracked,sync,get};
}
for(const provider of ['woocommerce','shopify']){
 test(`${provider}: 10 -> reserve2 -> unchanged resync stays8; repeated import and release do not inflate`,async()=>{
  const f=await fixture(provider);await f.sync();let p=await f.get();const oid=new mongoose.Types.ObjectId();
  await stock.reserveLine(p._id,f.store._id,oid,2);await stock.reserveLine(p._id,f.store._id,oid,2);await f.sync();await f.sync();
  p=await f.get();assert.equal(p.stock,8);assert.equal(p.catalogInventory.localAllocated,2);assert.equal(p.reservations.length,1);
  await stock.releaseLineForOrder(p._id,oid);await stock.releaseLineForOrder(p._id,oid);await f.sync();p=await f.get();assert.equal(p.stock,10);assert.equal(p.catalogInventory.localAllocated,0);
 });
 test(`${provider}: clamp does not erase allocation debt when remote drops below it`,async()=>{
  const f=await fixture(provider);await f.sync();let p=await f.get();const oid=new mongoose.Types.ObjectId();await stock.reserveLine(p._id,f.store._id,oid,8);
  f.setQuantity(3);await f.sync();p=await f.get();assert.equal(p.stock,0);assert.equal(p.catalogInventory.localAllocated,8);
  f.setQuantity(10);await f.sync();assert.equal((await f.get()).stock,2);
  f.setQuantity(3);await f.sync();await stock.releaseLineForOrder(p._id,oid);p=await f.get();assert.equal(p.stock,3);assert.equal(p.catalogInventory.localAllocated,0);
 });
 test(`${provider}: completed-token cleanup keeps allocation; cancellation epoch restores once`,async()=>{
  const f=await fixture(provider);await f.sync();let p=await f.get();const oid=new mongoose.Types.ObjectId();await stock.reserveLine(p._id,f.store._id,oid,2);await stock.pullOrderTokens(oid);
  await f.sync();p=await f.get();assert.equal(p.reservations.length,0);assert.equal(p.stock,8);assert.equal(p.catalogInventory.localAllocated,2);
  await stock.restoreLineForOrder(p._id,oid,2,'synthetic-epoch');await stock.restoreLineForOrder(p._id,oid,2,'synthetic-epoch');await f.sync();p=await f.get();assert.equal(p.stock,10);assert.equal(p.catalogInventory.localAllocated,0);assert.equal(p.restorations.length,1);
 });
 test(`${provider}: concurrent reservation and repeated sync never lose allocations`,async()=>{
  const f=await fixture(provider);f.setQuantity(5);await f.sync();const p=await f.get();
  const results=await Promise.all([...Array.from({length:15},()=>stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),1)),f.sync()]);
  assert.equal(results.filter(x=>x?.ok).length,5);await f.sync();const after=await f.get();assert.equal(after.stock,0);assert.equal(after.catalogInventory.localAllocated,5);assert.equal(after.reservations.length,5);
 });
 test(`${provider}: delayed old snapshot cannot overwrite newer base or metadata`,async()=>{
  const f=await fixture(provider);await f.sync();let release,entered;const gate=new Promise(r=>{entered=r;});
  const stale=importCatalog({...f.config,syncGeneration:2},{},{request:async()=>{entered();await new Promise(r=>{release=r;});return f.request();}});
  await gate;f.config.syncGeneration=2;f.setQuantity(4);await f.sync();release();await assert.rejects(stale,{code:'STALE_CATALOG_SYNC'});assert.equal((await f.get()).stock,4);assert.equal((await f.get()).catalogInventory.syncGeneration,3);
 });
 test(`${provider}: untracked and legacy checkout fail explicitly before saving an order`,async()=>{
  const f=await fixture(provider);f.setTracked(false);await f.sync();let p=await f.get();
  const req={get:()=>'',params:{storeId:String(f.store._id)},body:{products:[{productId:String(p._id),quantity:1}],paymentMethod:'cash_on_delivery',customerName:'Synthetic shopper',customerWhatsapp:'01012345678',customerAddress:'Synthetic address'}};
  let response=res();await orderController.createOrder(req,response);assert.equal(response.statusCode,409);assert.equal(response.body.code,'CATALOG_QUANTITY_UNCONFIRMED');assert.equal(await Order.countDocuments({storeId:f.store._id}),0);
  await Product.updateOne({_id:p._id},{$unset:{catalogInventory:''}});response=res();await orderController.createOrder(req,response);assert.equal(response.statusCode,409);assert.equal(response.body.code,'CATALOG_RECONCILIATION_REQUIRED');
  assert.equal(await Order.countDocuments({storeId:f.store._id}),0);
 });
 test(`${provider}: tracked/untracked/tracked change retains prior local allocations`,async()=>{
  const f=await fixture(provider);await f.sync();const p=await f.get();await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),2);
  f.setTracked(false);await f.sync();assert.equal((await f.get()).stock,0);assert.equal((await f.get()).catalogInventory.localAllocated,2);
  f.setTracked(true);f.setQuantity(12);await f.sync();assert.equal((await f.get()).stock,10);
 });
 test(`${provider}: legacy sync refuses without mutation; explicit clean reconciliation recovers`,async()=>{
  const f=await fixture(provider);const old=await Product.create({storeId:f.store._id,productName:'Synthetic old import',price:100,currency:'EGP',stock:8,importSource:provider,importSourceId:'17'});
  await assert.rejects(f.sync(),{code:'CATALOG_RECONCILIATION_REQUIRED'});assert.equal((await f.get()).stock,8);assert.equal((await f.get()).catalogInventory,undefined);
  const preview=await previewCatalogInventory(f.config,{},old._id,{request:f.request});assert.equal(preview.canReconcile,true);assert.equal(preview.remoteQuantity,10);
  const confirmation={confirm:true,expectedSourceKey:preview.sourceKey,expectedRemoteQuantity:10,sellableQuantity:8};
  const result=await reconcileCatalogInventory({...f.config,syncGeneration:2},{},old._id,confirmation,{request:f.request});assert.equal(result.sellableQuantity,8);
  f.config.syncGeneration=2;await f.sync();assert.equal((await f.get()).stock,8);assert.equal((await f.get()).catalogInventory.localAllocated,2);
  await assert.rejects(reconcileCatalogInventory({...f.config},{},old._id,confirmation,{request:f.request}),{code:'CATALOG_ALREADY_RECONCILED'});
 });
 test(`${provider}: reconciliation rejects missing confirmation, changed snapshot, active orders and stale lease`,async()=>{
  const f=await fixture(provider);f.config.syncGeneration=1;const p=await Product.create({storeId:f.store._id,productName:'Synthetic old import',price:100,currency:'EGP',stock:8,importSource:provider,importSourceId:'17'});
  const preview=await previewCatalogInventory(f.config,{},p._id,{request:f.request});
  const c={confirm:true,expectedSourceKey:preview.sourceKey,expectedRemoteQuantity:10,sellableQuantity:8};const run=(body=c,extra={})=>reconcileCatalogInventory(f.config,{},p._id,body,{request:f.request,...extra});
  await assert.rejects(run({...c,expectedSourceKey:'wrong source'}),{code:'CATALOG_SOURCE_CHANGED'});
  await assert.rejects(run({...c,confirm:false}),{code:'INVALID_RECONCILIATION_CONFIRMATION'});
  await assert.rejects(run({...c,sellableQuantity:11}),{code:'INVALID_RECONCILIATION_CONFIRMATION'});
  await assert.rejects(run({...c,expectedRemoteQuantity:11}),{code:'CATALOG_SNAPSHOT_CHANGED'});
  await assert.rejects(run(c,{isCurrent:async()=>false}),{code:'STALE_CATALOG_SYNC'});
  const o=await Order.create({storeId:f.store._id,products:[{productId:p._id,quantity:2,price:100}],totalPrice:200,paymentMethod:'whatsapp_confirmation',status:'pending'});
  await assert.rejects(run(),{code:'CATALOG_OPEN_ORDERS'});await Order.deleteOne({_id:o._id});f.setTracked(false);await assert.rejects(run(),{code:'CATALOG_QUANTITY_UNCONFIRMED'});assert.equal((await f.get()).catalogInventory,undefined);
 });
 test(`${provider}: invalid tracked remote quantity is rejected before changing a known balance`,async()=>{
  const f=await fixture(provider);await f.sync();f.setQuantity('unknown');await assert.rejects(f.sync(),{code:'REMOTE_INVALID_PRODUCT'});assert.equal((await f.get()).stock,10);
 });
 test(`${provider}: incomplete initial import is inactive and cannot reserve`,async()=>{
  const f=await fixture(provider);f.config.syncGeneration=1;
  const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{
   const result=await Product.updateOne(filter,update,options);
   if(update.$setOnInsert){const p=await f.get();assert.equal(p.isActive,false);assert.equal(p.stock,0);assert.equal((await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),1)).ok,false);}
   return result;
  }};
  await importCatalog(f.config,{},{request:f.request,productModel:model});assert.equal((await f.get()).isActive,true);assert.equal((await f.get()).stock,10);
 });
 test(`${provider}: changing remote origin or first variant cannot silently rebind allocations`,async()=>{
  const f=await fixture(provider);await f.sync();const p=await f.get();await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),2);
  await assert.rejects(importCatalog({...f.config,syncGeneration:2,origin:'https://other.invalid'},{},{request:f.request}),{code:'CATALOG_SOURCE_CHANGED'});
  if(provider==='shopify'){f.remote.variants[0].id=123;await assert.rejects(f.sync(),{code:'CATALOG_SOURCE_CHANGED'});}
  assert.equal((await f.get()).stock,8);
 });
}
test('local products keep ordinary stock behavior and catalog sync does not adopt them',async()=>{
 const f=await fixture('woocommerce');const p=await Product.create({storeId:f.store._id,productName:'Synthetic local product',price:100,currency:'EGP',stock:7});const oid=new mongoose.Types.ObjectId();
 await stock.reserveLine(p._id,f.store._id,oid,2);await f.sync();assert.equal((await Product.findById(p._id)).stock,5);await stock.releaseLineForOrder(p._id,oid);assert.equal((await Product.findById(p._id)).stock,7);assert.equal((await Product.findById(p._id)).catalogInventory,undefined);
});
test('imported product edits and supplier restocking reject before product/invoice/balance writes',async()=>{
 const f=await fixture('woocommerce');await f.sync();const p=await f.get();
 let r=res();await productController.updateProduct({params:{storeId:String(f.store._id),productId:String(p._id)},user:{userId:f.store.userId,role:'user'},body:{stock:99},file:{buffer:Buffer.from('synthetic'),originalname:'synthetic.png'}},r);
 assert.equal(r.statusCode,409);assert.equal((await f.get()).stock,10);
 const supplier=await Supplier.create({storeId:f.store._id,name:'Synthetic supplier',balance:0});r=res();await supplierController.createPurchaseInvoice({params:{storeId:String(f.store._id),supplierId:String(supplier._id)},user:{userId:f.store.userId,role:'user'},body:{items:[{productId:p._id,qty:3}],total:300,paid:0}},r);
 assert.equal(r.statusCode,409);assert.equal(await Invoice.countDocuments({storeId:f.store._id}),0);assert.equal((await Supplier.findById(supplier._id)).balance,0);assert.equal((await f.get()).stock,10);
});

test('public product paths expose legacy/incomplete stock as unconfirmed without exposing source or ledger',async()=>{
 const f=await fixture('woocommerce');await f.sync();const p=await f.get();
 for(const state of ['legacy','incomplete','known']){
  if(state==='legacy')await Product.updateOne({_id:p._id},{$unset:{catalogInventory:''},$set:{stock:8,stockTracked:true}});
  else await Product.updateOne({_id:p._id},{$set:{catalogInventory:{sourceKey:'synthetic',remoteQuantity:10,localAllocated:2,syncGeneration:state==='incomplete'?0:1}}});
  for(const [method,query]of [['getProducts',{}],['getProducts',{random:'true'}],['getBestsellers',{}],['getProduct',{}]]){
   const response=res();await productController[method]({params:{storeId:String(f.store._id),productId:String(p._id)},query},response);
   assert.equal(response.statusCode,200);const raw=response.body.products?.[0]||response.body[0]||response.body;const doc=JSON.parse(JSON.stringify(raw));
   assert.equal(doc.stockTracked,state==='known',method+':'+state);for(const key of ['catalogInventory','importSource','importSourceId'])assert.equal(key in doc,false);
  }
 }
});

for(const provider of ['woocommerce','shopify'])test(`${provider}: imported deletion retains the allocation tombstone after token cleanup`,async()=>{
 const f=await fixture(provider);await f.sync();let p=await f.get();const id=p._id,oid=new mongoose.Types.ObjectId();
 await stock.reserveLine(id,f.store._id,oid,2);await stock.pullOrderTokens(oid);
 const response=res();await productController.deleteProduct({params:{storeId:String(f.store._id),productId:String(id)},user:{userId:f.store.userId,role:'user'}},response);
 assert.equal(response.statusCode,200);p=await f.get();assert.equal(p.isActive,false);assert.equal(p.catalogInventory.localAllocated,2);
 await f.sync();p=await f.get();assert.equal(String(p._id),String(id));assert.equal(p.stock,8);assert.equal(p.catalogInventory.localAllocated,2);
});

test('Mongo-time fence rejects a snapshot whose lease expires after the final application check',async()=>{
 const f=await fixture('woocommerce');await f.sync();f.setQuantity(20);
 const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(filter,update,options)=>{
  if(Array.isArray(update))await new Promise(r=>setTimeout(r,120));
  return Product.updateOne(filter,update,options);
 }};
 await assert.rejects(importCatalog({...f.config,syncGeneration:2,leaseUntil:new Date(Date.now()+80)},{},{request:f.request,productModel:model,isCurrent:async()=>true}),{code:'STALE_CATALOG_SYNC'});
 const p=await f.get();assert.equal(p.stock,10);assert.equal(p.catalogInventory.syncGeneration,1);
});

test('Mongo-time fence rejects reconciliation after its final application check without establishing a baseline',async()=>{
 const f=await fixture('woocommerce');const p=await Product.create({storeId:f.store._id,productName:'Legacy lease boundary',price:100,currency:'EGP',stock:8,importSource:'woocommerce',importSourceId:'17'});
 f.config.syncGeneration=1;const preview=await previewCatalogInventory(f.config,{},p._id,{request:f.request});
 const model={findOne:(...a)=>Product.findOne(...a),updateOne:async(...a)=>{await new Promise(r=>setTimeout(r,120));return Product.updateOne(...a);}};
 await assert.rejects(reconcileCatalogInventory({...f.config,leaseUntil:new Date(Date.now()+80)},{},p._id,{confirm:true,expectedSourceKey:preview.sourceKey,expectedRemoteQuantity:10,sellableQuantity:5},{request:f.request,productModel:model,isCurrent:async()=>true}),{code:'CATALOG_RECONCILIATION_CONFLICT'});
 const after=await f.get();assert.equal(after.stock,8);assert.equal(after.catalogInventory,undefined);
});
test('inactive imported tombstone blocks both stale-cart checkout and fresh reservation',async()=>{
 const f=await fixture('woocommerce');await f.sync();const p=await f.get();await Product.updateOne({_id:p._id},{$set:{isActive:false}});
 assert.equal((await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),1)).ok,false);
 const response=res();await orderController.createOrder({get:()=>'',params:{storeId:String(f.store._id)},body:{products:[{productId:String(p._id),quantity:1}],paymentMethod:'cash_on_delivery',customerName:'Synthetic shopper',customerWhatsapp:'01012345678',customerAddress:'Synthetic address'}},response);
 assert.equal(response.statusCode,409);assert.equal(response.body.code,'PRODUCT_UNAVAILABLE');assert.equal(await Order.countDocuments({storeId:f.store._id}),0);
});
test('partial snapshot failure cannot retire omitted source rows',async()=>{
 const f=await fixture('woocommerce');await f.sync();const p=await f.get();let calls=0;
 await assert.rejects(importCatalog({...f.config,syncGeneration:2},{},{request:async()=>{if(++calls===2)throw new Error('synthetic failure');return {body:[],headers:{'x-wp-totalpages':'2'}};}}));
 const after=await Product.findById(p._id);assert.equal(after.isActive,true);assert.equal(after.stock,10);assert.equal(after.catalogInventory.syncGeneration,1);
});
test('successful empty catalog retires source rows without forgetting allocations',async()=>{
 const f=await fixture('woocommerce');await f.sync();const p=await f.get();await stock.reserveLine(p._id,f.store._id,new mongoose.Types.ObjectId(),2);
 assert.equal(await importCatalog({...f.config,syncGeneration:2},{},{request:async()=>({body:[],headers:{'x-wp-totalpages':'0'}})}),0);
 const after=await f.get();assert.equal(after.isActive,false);assert.equal(after.stock,0);assert.equal(after.catalogInventory.localAllocated,2);
});
test('legacy name-only chat obligations block baseline establishment until settled',async()=>{
 const f=await fixture('woocommerce');f.config.botId=new mongoose.Types.ObjectId();f.config.syncGeneration=1;
 const p=await Product.create({storeId:f.store._id,productName:'Legacy chat obligation',price:100,currency:'EGP',stock:8,importSource:'woocommerce',importSourceId:'17'});
 await require('../server/models/ChatOrder').create({botId:f.config.botId,channel:'web',sourceUserId:'synthetic-open-order',items:[{title:'Legacy chat obligation',quantity:2,price:100}],status:'confirmed'});
 const preview=await previewCatalogInventory(f.config,{},p._id,{request:f.request});assert.equal(preview.canReconcile,false);
 await assert.rejects(reconcileCatalogInventory(f.config,{},p._id,{confirm:true,expectedSourceKey:preview.sourceKey,expectedRemoteQuantity:10,sellableQuantity:8},{request:f.request}),{code:'CATALOG_OPEN_ORDERS'});
});
