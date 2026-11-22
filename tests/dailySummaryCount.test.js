'use strict';
// Actual summary function, all database/provider/scheduler boundaries stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const Bot = require('../server/models/Bot');
const ChatOrder = require('../server/models/ChatOrder');
const Booking = require('../server/models/Booking');
const Conversation = require('../server/models/Conversation');
const cron = require('node-cron');
const axios = require('axios');
const originals = { bot:Bot.findById, orders:ChatOrder.find, booking:Booking.find, conversations:Conversation.countDocuments, schedule:cron.schedule, get:axios.get, post:axios.post };
let bot, orders, bookings, conversations, hotLeads, calls, queries;
const dispatcherId = require.resolve('../server/services/notificationDispatcher');
const priorDispatcher = require.cache[dispatcherId];
require.cache[dispatcherId] = { id:dispatcherId, filename:dispatcherId, loaded:true, exports:{ dispatchMultiChannelNotification:async payload=>{calls.push(payload);return {delivered:0,failed:0};} } };
cron.schedule = () => { throw new Error('No schedules allowed in this fixture'); };
axios.get = axios.post = async () => { throw new Error('No provider calls allowed in this fixture'); };
Bot.findById = () => ({select:async()=>bot});
ChatOrder.find = query => {queries.push({kind:'orders',query});return {select:async()=>orders};};
Booking.find = query => {queries.push({kind:'bookings',query});return {countDocuments:async()=>bookings};};
Conversation.countDocuments = async query => {queries.push({kind:'conversations',query});return query.category ? hotLeads : conversations;};
const {runBotDailySummary} = require('../server/cronJobs');
test.beforeEach(()=>{bot={_id:'synthetic-bot',userId:'synthetic-owner',agentTools:{dailyDigestTool:{enabled:true}}};orders=[];bookings=0;conversations=0;hotLeads=0;calls=[];queries=[];});
test.after(()=>{Bot.findById=originals.bot;ChatOrder.find=originals.orders;Booking.find=originals.booking;Conversation.countDocuments=originals.conversations;cron.schedule=originals.schedule;axios.get=originals.get;axios.post=originals.post;if(priorDispatcher)require.cache[dispatcherId]=priorDispatcher;else delete require.cache[dispatcherId];});
test('booking count is returned and passed to the existing summary event',async()=>{
 orders=[{totalAmount:100},{totalAmount:'25'}];bookings=3;conversations=4;hotLeads=2;
 const data=await runBotDailySummary('synthetic-bot');
 assert.deepEqual(data,{conversationsCount:4,ordersCount:2,revenue:125,currency:'EGP',bookingsCount:3,hotLeadsCount:2});
 assert.deepEqual(calls,[{userId:'synthetic-owner',botId:'synthetic-bot',event:'daily_digest',data}]);
 assert.equal(queries.length,4);for(const {query}of queries)assert.equal(query.botId,'synthetic-bot');
 assert.ok(queries.find(x=>x.kind==='bookings').query.createdAt.$gte instanceof Date);
});
for(const active of ['bookings','orders','conversations'])test(`${active}-only activity keeps existing dispatch condition`,async()=>{
 if(active==='bookings')bookings=1;if(active==='orders')orders=[{totalAmount:5}];if(active==='conversations')conversations=1;
 const result=await runBotDailySummary('synthetic-bot');assert.equal(result.bookingsCount,bookings);assert.equal(calls.length,1);
});
test('empty day returns numeric zero and keeps existing no-dispatch behavior',async()=>{
 assert.equal((await runBotDailySummary('synthetic-bot')).bookingsCount,0);assert.equal(calls.length,0);
});
test('missing bot and explicitly disabled digest do not query data or dispatch',async()=>{
 bot=null;assert.equal(await runBotDailySummary('synthetic-bot'),null);
 bot={agentTools:{dailyDigestTool:{enabled:false}}};assert.equal(await runBotDailySummary('synthetic-bot'),null);
 assert.equal(queries.length,0);assert.equal(calls.length,0);
});
test('hot-leads-only day does not widen existing dispatch condition',async()=>{
 hotLeads=2;const data=await runBotDailySummary('synthetic-bot');assert.equal(data.hotLeadsCount,2);assert.equal(calls.length,0);
});
