'use strict';
process.env.NODE_ENV='test';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const test=require('node:test');const assert=require('node:assert/strict');const mongoose=require('mongoose');const {MongoMemoryServer}=require('mongodb-memory-server');
const ai=require('../server/services/aiFailover');let reply;ai.getAiCompletion=async()=>({choices:[{message:{content:JSON.stringify(reply)}}]});
require('../server/services/webhookDispatcher').dispatchWebhook=async()=>{};
require('../server/services/notificationDispatcher').dispatchMultiChannelNotification=async()=>{};
const telegram=require('../server/services/telegramService');telegram.notifyChatOrder=async()=>{};telegram.notifyOrderStatus=async()=>{};
const {extractChatOrderIntent,buildOrderStateNote}=require('../server/botEngine');
const {buildProductContext}=require('../server/services/productContext');
const Product=require('../server/models/Product');const Store=require('../server/models/Store');const ChatOrder=require('../server/models/ChatOrder');
let db,serial=0;
test.before(async()=>{db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('chat-inventory-review'));});test.after(async()=>{await mongoose.disconnect();await db.stop();});
for(const mode of ['legacy','known'])test('PROBE: chat order stock authority for '+mode,async()=>{
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Chat review '+(++serial),storeLink:'chat-review-'+serial,templateId:1,userId});
 const p=await Product.create({storeId:store._id,productName:'Synthetic Widget',price:100,currency:'EGP',stock:mode==='legacy'?8:1,stockTracked:true,isActive:true,importSource:'woocommerce',importSourceId:'17',...(mode==='known'?{catalogInventory:{sourceKey:'review',remoteQuantity:10,localAllocated:9,syncGeneration:1}}:{})});
 const bot={_id:new mongoose.Types.ObjectId(),userId,storeId:store._id,name:'Synthetic review bot'};
 reply={intent:true,customerName:'Synthetic customer',customerPhone:'01012345678',customerAddress:'Synthetic local address',items:[{title:'Synthetic Widget',quantity:2}],status:'confirmed'};
 const result=await extractChatOrderIntent({bot,channel:'web',userMessageContent:'تمام أكد الطلب',conversationId:new mongoose.Types.ObjectId(),sourceUserId:'review-'+serial,messageId:'review-'+serial,transcript:[]});
 const after=await Product.findById(p._id);const count=await ChatOrder.countDocuments({botId:bot._id});
 console.log('CHAT_INVENTORY',JSON.stringify({mode,saved:result.saved,outcome:result.outcome,status:result.chatOrder?.status,orders:count,stock:after.stock,allocation:after.catalogInventory?.localAllocated,note:buildOrderStateNote(result)}));
 assert.equal(result.saved,false,'unknown inventory or insufficient local stock must not become a confirmed chat order');
});
test('PROBE: product context marks legacy count as unconfirmed',()=>{
 const context=buildProductContext([{_id:'507f191e810c19729de86999',productName:'Synthetic Widget',price:100,currency:'EGP',stock:8,stockTracked:true,isActive:true,importSource:'woocommerce'}],'Synthetic Widget','review','https://review.invalid');
 console.log('LEGACY_CONTEXT',context);assert.doesNotMatch(context,/المخزون: 8/);
});
test('imported catalog chat handoff is deterministic and legacy cancellation never restores unreserved stock',async()=>{
 const {customerTruthSentence,enforceTruthfulOrderReply}=require('../server/botEngine');
 const result={outcome:'inventory_storefront_required',saved:false,storefrontUrl:'https://review.invalid/store/synthetic/landing'};
 assert.match(customerTruthSentence(result),/لم يُسجل طلب جديد/);assert.match(enforceTruthfulOrderReply('تم تأكيد طلبك',result),/https:\/\/review.invalid\/store\/synthetic\/landing/);
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Cancel review '+(++serial),storeLink:'cancel-review-'+serial,templateId:1,userId});const bot={_id:new mongoose.Types.ObjectId(),userId,storeId:store._id,name:'Synthetic cancel bot'};
 const p=await Product.create({storeId:store._id,productName:'Synthetic Widget',price:100,currency:'EGP',stock:1,importSource:'woocommerce',importSourceId:'17',catalogInventory:{sourceKey:'review',remoteQuantity:10,localAllocated:9,syncGeneration:1}});
 const conversationId=new mongoose.Types.ObjectId();const old=await ChatOrder.create({botId:bot._id,channel:'web',conversationId,sourceUserId:'cancel-synthetic',items:[{title:'Synthetic Widget',price:100,quantity:2}],status:'confirmed'});
 reply={intent:false,items:[],status:'cancelled'};
 const cancelled=await extractChatOrderIntent({bot,channel:'web',conversationId,sourceUserId:'cancel-synthetic',userMessageContent:'الغي الطلب',transcript:[]});assert.equal(cancelled.outcome,'cancelled');assert.equal((await ChatOrder.findById(old._id)).status,'cancelled');const after=await Product.findById(p._id);assert.equal(after.stock,1);assert.equal(after.catalogInventory.localAllocated,9);
});
test('imported catalogs still allow ordinary product questions without an order handoff',async()=>{
 const userId=new mongoose.Types.ObjectId();const store=await Store.create({storeName:'Question review '+(++serial),storeLink:'question-review-'+serial,templateId:1,userId});await Store.updateOne({_id:store._id},{$set:{catalogInventoryMode:'imported'}});
 const bot={_id:new mongoose.Types.ObjectId(),userId,storeId:store._id,name:'Synthetic question bot'};reply={intent:false,items:[]};
 const result=await extractChatOrderIntent({bot,channel:'web',sourceUserId:'question-only',userMessageContent:'بكام المنتج؟',transcript:[]});assert.equal(result,null);
});
