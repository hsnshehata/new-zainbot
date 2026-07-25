const MIN_PRODUCTION_SECRET_LENGTH = 32;

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getJwtSecret() {
  const secret = getRequiredEnv('JWT_SECRET');
  if (
    process.env.NODE_ENV === 'production'
    && Buffer.byteLength(secret, 'utf8') < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} bytes in production`);
  }
  return secret;
}

function getMongoUri() {
  const configuredUri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();
  if (configuredUri) {
    return configuredUri;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI is required in production');
  }

  return 'mongodb://127.0.0.1:27017/zainbot';
}

module.exports = {
  getRequiredEnv,
  getJwtSecret,
  getMongoUri,
  MIN_PRODUCTION_SECRET_LENGTH,
};
