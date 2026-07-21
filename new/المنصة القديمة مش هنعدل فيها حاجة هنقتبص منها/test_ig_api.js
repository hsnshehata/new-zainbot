require("dotenv").config();
const mongoose = require("mongoose");
const Bot = require("./server/models/Bot");
const axios = require("axios");

const uri = "mongodb+srv://hsnshehata1:5K46L0Epg0Wanq8D@cluster0.t1lj409.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri).then(async () => {
    const bot = await Bot.findOne({ _id: "69705ad3fd9bb5f6eafdef2b" });
    if (!bot || !bot.instagramApiKey) {
        console.log("No bot or token found.");
        return process.exit(1);
    }

    console.log("Token:", bot.instagramApiKey.substring(0, 10) + "...");

    try {
        const response = await axios.get(`https://graph.instagram.com/v20.0/me?fields=id,user_id,name,username,account_type&access_token=${bot.instagramApiKey}`);
        console.log("ME response:", response.data);
    } catch (e) {
        console.error("ME error:", e.response?.data || e.message);
    }

    try {
        const response2 = await axios.get(`https://graph.instagram.com/v20.0/${bot.instagramPageId}?fields=id,user_id,name,username,account_type&access_token=${bot.instagramApiKey}`);
        console.log("ID-based response:", response2.data);
    } catch (e) {
        console.error("ID error:", e.response?.data || e.message);
    }

    process.exit(0);
}).catch(console.error);
