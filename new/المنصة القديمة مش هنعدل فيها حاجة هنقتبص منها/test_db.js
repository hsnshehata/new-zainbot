require("dotenv").config();
const mongoose = require("mongoose");
const Bot = require("./server/models/Bot");

const uri = "mongodb+srv://hsnshehata1:5K46L0Epg0Wanq8D@cluster0.t1lj409.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri).then(async () => {
    const bots = await Bot.find({ instagramPageId: { $ne: null } });
    console.log("Found Bots with Instagram:");
    bots.forEach(b => {
        console.log(`Bot ID: ${b._id} | IG Page ID: ${b.instagramPageId} | Token: ${b.instagramApiKey ? 'Exists' : 'No'} | Name: ${b.name}`);
    });
    mongoose.disconnect();
}).catch(console.error);
