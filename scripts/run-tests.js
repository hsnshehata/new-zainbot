'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDirectory = path.resolve(__dirname, '..', 'tests');
const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

for (const fileName of testFiles) {
  const result = spawnSync(process.execPath, [path.join(testsDirectory, fileName)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
