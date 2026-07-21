const mongoose = require('mongoose');
const logger = require('./logger');

let reconnecting = false;

const connectDB = async (retries = 3, delayMs = 3000) => {
  const MONGODB_URI = process.env.MONGODB_URI;
  const localURI = 'mongodb://127.0.0.1:27017/zainbot';
  
  const uriToUse = MONGODB_URI || localURI;

  try {
    logger.info(`Connecting to MongoDB...`);
    await mongoose.connect(uriToUse, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
    });
    logger.info('✅ MongoDB connected');

    const { connection } = mongoose;
    connection.on('disconnected', () => {
      if (reconnecting) return;
      reconnecting = true;
      logger.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
      setTimeout(() => {
        connectDB(2).finally(() => { reconnecting = false; });
      }, 3000);
    });

    connection.on('reconnected', () => {
      logger.info('✅ MongoDB reconnected');
    });

    connection.on('error', (err) => {
      logger.error('❌ MongoDB connection error event:', { err: err.message });
    });
  } catch (err) {
    logger.warn(`Failed to connect to primary URI: ${err.message}`);
    if (uriToUse !== localURI) {
      try {
        logger.info(`Attempting fallback to local MongoDB...`);
        await mongoose.connect(localURI, {
          serverSelectionTimeoutMS: 3000,
          socketTimeoutMS: 30000,
        });
        logger.info('✅ Connected to local fallback MongoDB successfully');
        return;
      } catch (fallbackErr) {
        logger.error(`❌ Local fallback MongoDB connection failed: ${fallbackErr.message}`);
      }
    }
    
    if (retries > 0) {
      logger.warn('Retrying MongoDB connection...', { retries });
      await new Promise((res) => setTimeout(res, delayMs));
      return connectDB(retries - 1, delayMs);
    }
    logger.error('❌ MongoDB connection failed. Keeping server running in offline mode.');
  }
};

module.exports = connectDB;
