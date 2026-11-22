'use strict';
// Read-only-behavior probe, synthetic in-memory Mongo; model boundary stubbed.
process.env.NODE_ENV='test';process.env.MONGOMS_VERSION='7.0.24';process.env.JWT_SECRET='synthetic-quota-fixture-secret-32-bytes';
const assert=require('node:assert/strict');const mongoose=require('mongoose');
const {MongoMemoryServer}=require('mongodb-memory-server');let requested=0;
function stub(p,exports){const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../../server/services/aiFailover',{getAiCompletion:async()=>{requested++;return {choices:[{message:{content:'Synthetic answer'}}]};}});
stub('../../server/services/aiKeyResolver',{createAiKeyResolver:()=>({listGlobalAiKeys:async()=>[{provider:'openai',apiKey:'synthetic'}]})});
(async()=>{let db,server;try{
 db=await MongoMemoryServer.create();await mongoose.connect(db.getUri('assistant-quota-probe'));
 const User=require('../../server/models/User');const Bot=require('../../server/models/Bot');
 const owner=await new User({username:'syntheticquota',email:'synthetic@example.invalid',password:'synthetic-not-a-credential',role:'user',status:'active',subscriptionTier:'free',dailyMessagesUsed:25,monthlyMessagesUsed:250,lastUsageReset:new Date(),sessionVersion:0}).save({validateBeforeSave:false});
 await Bot.create({userId:owner._id,name:'Synthetic quota bot',isActive:true});
 const express=require('express');const app=express();app.use(express.json());app.use('/api/assistant',require('../../server/routes/assistant'));
 const {signAccessToken}=require('../../server/utils/authTokens');const request=require('supertest');
 const response=await request(app).post('/api/assistant/chat').set('Authorization',`Bearer ${signAccessToken(owner)}`).send({message:'What can you help me with?'});
 const after=await User.findById(owner._id).lean();
 assert.equal(response.status,200);assert.equal(requested,1);
 assert.equal(after.dailyMessagesUsed,25);assert.equal(after.monthlyMessagesUsed,250);
 console.log(JSON.stringify({httpStatus:response.status,modelBoundaryCalls:requested,quotaBefore:{daily:25,monthly:250},quotaAfter:{daily:after.dailyMessagesUsed,monthly:after.monthlyMessagesUsed},providerCalls:0,note:'Product policy for owner-assistant quota remains unresolved'}));
}finally{if(server)server.close();await mongoose.disconnect();if(db)await db.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
