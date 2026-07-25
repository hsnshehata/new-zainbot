const mongoose = require('mongoose');
const logger = require('./logger');
const { getMongoUri } = require('./config/env');

let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  mongoose.connection.on('disconnected', () => {
    logger.warn('mongodb_disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('mongodb_reconnected');
  });
  mongoose.connection.on('error', (error) => {
    logger.error('mongodb_connection_error', { error: error.message });
  });
}

async function connectDB(retries = 3, delayMs = 3000) {
  const uri = getMongoUri();
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      logger.info('mongodb_connecting', { attempt, maxAttempts: retries + 1 });
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
      });
      registerConnectionListeners();
      logger.info('mongodb_connected');
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      logger.warn('mongodb_connection_attempt_failed', {
        attempt,
        maxAttempts: retries + 1,
        error: error.message,
      });
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`MongoDB connection failed after ${retries + 1} attempts: ${lastError?.message}`);
}

module.exports = connectDB;
