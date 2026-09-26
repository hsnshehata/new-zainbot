'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDirectory = path.resolve(__dirname, '..', 'tests');

function collectTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTestFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith('.test.js')) return [fullPath];
      return [];
    });
}

const testFiles = collectTestFiles(testsDirectory);

for (const filePath of testFiles) {
  const result = spawnSync(process.execPath, [filePath], {
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
