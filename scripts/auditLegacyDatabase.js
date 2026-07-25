'use strict';

const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
  override: false,
});

async function collectionExists(db, name) {
  const collections = await db
    .listCollections({ name }, { nameOnly: true })
    .toArray();
  return collections.length > 0;
}

async function auditLegacyDatabase() {
  const uri =
    process.env.LEGACY_MONGODB_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;
  if (!uri) {
    const error = new Error('Legacy database URI is not configured.');
    error.code = 'LEGACY_DATABASE_URI_MISSING';
    throw error;
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 12_000,
    connectTimeoutMS: 12_000,
  });

  try {
    await client.connect();
    const db = client.db();
    const collectionInfos = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const collectionNames = collectionInfos
      .map(({ name }) => name)
      .sort((left, right) => left.localeCompare(right));

    const collectionCounts = {};
    for (const name of collectionNames) {
      collectionCounts[name] = await db
        .collection(name)
        .estimatedDocumentCount();
    }

    const report = {
      database: db.databaseName,
      collections: collectionCounts,
    };

    if (await collectionExists(db, 'users')) {
      report.usersBySubscription = await db
        .collection('users')
        .aggregate([
          {
            $group: {
              _id: {
                type: { $ifNull: ['$subscriptionType', 'missing'] },
                tier: { $ifNull: ['$subscriptionTier', 'missing'] },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ])
        .toArray();
    }

    if (await collectionExists(db, 'conversations')) {
      report.conversationsByChannel = await db
        .collection('conversations')
        .aggregate([
          {
            $group: {
              _id: { $ifNull: ['$channel', 'missing'] },
              conversations: { $sum: 1 },
              messages: {
                $sum: { $size: { $ifNull: ['$messages', []] } },
              },
            },
          },
          { $sort: { conversations: -1 } },
        ])
        .toArray();

      const duplicateGroups = await db
        .collection('conversations')
        .aggregate([
          {
            $group: {
              _id: {
                botId: '$botId',
                userId: '$userId',
                channel: '$channel',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $count: 'groups' },
        ])
        .toArray();

      report.duplicateConversationGroups = duplicateGroups[0]?.groups || 0;
    }

    if (await collectionExists(db, 'whatsappsessions')) {
      const sessions = db.collection('whatsappsessions');
      report.whatsappSessions = {
        total: await sessions.countDocuments({}),
        withSessionData: await sessions.countDocuments({
          sessionData: { $exists: true, $nin: [null, {}] },
        }),
      };
    }

    return report;
  } finally {
    await client.close();
  }
}

auditLegacyDatabase()
  .then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        error: error.name || 'Error',
        code: error.code || 'UNKNOWN',
      })}\n`
    );
    process.exitCode = 1;
  });
