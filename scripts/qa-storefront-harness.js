'use strict';

// QA harness: boots the app against an in-memory Mongo, seeds a demo
// store + product, and serves the storefront for visual verification.
// Not part of the production runtime; used by local QA only.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('zainbot-qa');
  process.env.PORT = process.env.PORT || '4100';
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa-harness-secret';
  process.env.CRON_JOBS_ENABLED = 'false';

  const server = require('../server/server');
  await server.startServer();

  const mongoose = require('mongoose');
  const Store = require('../server/models/Store');
  const Product = require('../server/models/Product');

  const store = await Store.create({
    storeName: 'متجر المراجعة',
    storeLink: 'qa-review-store',
    templateId: 1,
    landingLayout: 'layout1',
    primaryColor: '#6d28d9',
    secondaryColor: '#ffffff',
    currency: 'EGP',
  });

  await Product.create({
    storeId: store._id,
    productName: 'حقيبة جلد طبيعي',
    description: 'حقيبة يد جلد طبيعي صناعة يدوية، متوفرة بعدة ألوان.',
    price: 750,
    currency: 'EGP',
    stock: 12,
    images: [],
  });

  console.log(`QA_READY url=http://127.0.0.1:${process.env.PORT}/store/qa-review-store/landing`);

  // Keep alive until killed.
  process.on('SIGTERM', async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('QA_HARNESS_FAILED', err && err.message);
  process.exit(1);
});
