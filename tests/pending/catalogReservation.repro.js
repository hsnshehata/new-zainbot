'use strict';
// Known failing regression. Run explicitly: node tests/pending/catalogReservation.repro.js
// Not named *.test.js, so the default suite excludes it openly while the owner
// decides inventory authority. Do not change importer behavior to satisfy this
// before that decision. All data is synthetic and in-memory; remote reads stubbed.
process.env.NODE_ENV='test';process.env.MONGOMS_VERSION=process.env.MONGOMS_VERSION||'7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');
const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const Product=require('../../server/models/Product');const Store=require('../../server/models/Store');
const stock=require('../../server/services/stockService');const {importCatalog}=require('../../server/services/catalogImportService');
let db;
test.before(async()=>{db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('pending-catalog-reservations'));});
test.after(async()=>{await mongoose.disconnect();if(db)await db.stop();});
for(const provider of ['woocommerce','shopify']) {
  test(`KNOWN FAILURE: ${provider} resync must not reoffer the two locally reserved units`,async()=>{
    const store=await Store.create({storeName:'Synthetic pending '+provider,storeLink:'pending-'+provider,templateId:1,userId:new mongoose.Types.ObjectId(),currency:'EGP'});
    const remote=provider==='woocommerce'
      ?{id:17,name:'Synthetic tracked product',price:'100',stock_quantity:10,manage_stock:true,status:'publish'}
      :{id:17,title:'Synthetic tracked product',status:'active',variants:[{id:99,price:'100',inventory_quantity:10,inventory_management:'shopify'}]};
    const request=async()=>({body:provider==='woocommerce'?[remote]:{products:[remote]},headers:provider==='woocommerce'?{'x-wp-totalpages':'1'}:{}});
    const config={provider,origin:provider==='woocommerce'?'https://example.invalid':'https://synthetic.myshopify.com',storeId:store._id,currency:'EGP'};
    const credentials=provider==='woocommerce'?{consumerKey:'synthetic',consumerSecret:'synthetic'}:{token:'synthetic'};
    await importCatalog(config,credentials,{request});
    const product=await Product.findOne({storeId:store._id,importSource:provider,importSourceId:'17'});
    assert.equal(product.stock,10);
    const orderId=new mongoose.Types.ObjectId();
    assert.equal((await stock.reserveLine(product._id,store._id,orderId,2)).ok,true);
    assert.equal((await Product.findById(product._id)).stock,8);
    await importCatalog(config,credentials,{request});
    const after=await Product.findById(product._id);
    assert.equal(after.reservations.length,1,'Reservation ledger must still have one entry');
    assert.equal(String(after.reservations[0].orderId),String(orderId));
    console.log(JSON.stringify({provider,initial:10,afterReserve:8,afterResync:after.stock,reservationEntries:after.reservations.length}));
    assert.equal(after.stock,8,'Resync restored reserved units to saleable stock; inventory authority unresolved');
  });
}
