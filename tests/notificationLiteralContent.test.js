'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const NotificationRecipient=require('../server/models/NotificationRecipient');
const Bot=require('../server/models/Bot');const User=require('../server/models/User');const Notification=require('../server/models/Notification');
const telegramCalls=[],whatsappCalls=[],records=[];
function stub(p,exports){const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../server/services/telegramService',{sendTelegramMessage:async(target,text)=>{telegramCalls.push({target,text});return {ok:true};}});
stub('../server/services/whatsappSessionManager',{getWhatsAppSessionManager:()=>({sendDirectText:async(botId,target,text)=>{whatsappCalls.push({botId,target,text});}})});
const {dispatchMultiChannelNotification,...formatters}=require('../server/services/notificationDispatcher');
const RAW='حسن <b>خاص</b> & "quoted" &lt;literal&gt;';
const ESC='حسن &lt;b&gt;خاص&lt;/b&gt; &amp; "quoted" &amp;lt;literal&amp;gt;';
const original={bot:Bot.findById,user:User.findById,recipients:NotificationRecipient.find,create:Notification.create};
test.before(()=>{
 Bot.findById=()=>({select:async()=>({_id:'synthetic-bot',userId:'synthetic-owner',name:RAW})});
 User.findById=()=>({select:async()=>({planTier:'growth',subscriptionType:'monthly'})});
 NotificationRecipient.find=async()=>[{channel:'telegram',target:'synthetic-telegram'},{channel:'whatsapp',target:'synthetic-whatsapp'}];
 Notification.create=async data=>{records.push(data);return data;};
});
test.after(()=>{Bot.findById=original.bot;User.findById=original.user;NotificationRecipient.find=original.recipients;Notification.create=original.create;});

test('all exported formatters escape dynamic text but preserve static bold wrappers',()=>{
 const data={customerName:RAW,customerPhone:RAW,customerAddress:RAW,serviceType:RAW,notes:RAW,message:RAW,currency:RAW,total:RAW,revenue:RAW,conversationsCount:RAW,ordersCount:RAW,bookingsCount:RAW,hotLeadsCount:RAW,items:[{title:RAW,quantity:RAW,price:RAW,currency:RAW}]};
 for(const [name,format]of Object.entries(formatters)){
  const text=format(data,RAW);
  assert.ok(text.includes(ESC),name);assert.ok(text.includes('<b>'),name);
  assert.ok(!text.includes(RAW),name);
  assert.deepEqual((text.match(/<[^>]*>/g)||[]).filter(tag=>tag!=='<b>'&&tag!=='</b>'),[],name);
 }
 assert.equal(data.customerName,RAW,'stored/input values stay untouched');
});

for(const event of ['order_created','chat_order','booking_created','booking_rescheduled','booking_cancelled','urgent_complaint','human_handoff','daily_digest','synthetic_custom_event']){
 test(`${event}: Telegram is escaped; WhatsApp and in-app retain literal content exactly once`,async()=>{
  const before={t:telegramCalls.length,w:whatsappCalls.length,n:records.length};
  const result=await dispatchMultiChannelNotification({userId:'synthetic-owner',botId:'synthetic-bot',event,data:{customerName:RAW,notes:RAW,message:RAW,currency:RAW,items:[{title:RAW,quantity:1,price:100}],total:100,revenue:100}});
  assert.deepEqual(result,{delivered:2,failed:0});
  const telegram=telegramCalls[before.t].text;const whatsapp=whatsappCalls[before.w].text;const record=records[before.n];
  assert.ok(telegram.includes(ESC));assert.ok(!telegram.includes(RAW));
  assert.ok(whatsapp.includes(RAW));assert.ok(!whatsapp.includes(ESC));
  assert.ok(record.message.includes(RAW));assert.ok(!record.message.includes(ESC));
  assert.ok(record.title.includes(RAW),'plain title retains original name');
 });
}

test('generic event names and JSON fallback are text, not Telegram markup',async()=>{
 await dispatchMultiChannelNotification({userId:'synthetic-owner',botId:'synthetic-bot',event:RAW,data:{value:RAW}});
 assert.ok(telegramCalls.at(-1).text.includes(ESC));
 assert.ok(whatsappCalls.at(-1).text.includes(RAW));
 assert.ok(whatsappCalls.at(-1).text.includes(JSON.stringify({value:RAW})));
});
