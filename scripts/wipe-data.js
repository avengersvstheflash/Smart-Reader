const fs = require('fs');
const path = require('path');
const config = require('../backend/config');

const dbPath = config.DB_PATH;

if (dbPath.includes('test-data.db')) {
  console.error('[Safety Abort] DB_PATH points to test-data.db. Aborting data wipe.');
  process.exit(1);
}

const targets = [
  dbPath,
  `${dbPath}-wal`,
  `${dbPath}-shm`,
];

let deletedCount = 0;
for (const target of targets) {
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log(`[Wiped] ${target}`);
    deletedCount++;
  } else {
    console.log(`[Not Found] ${target}`);
  }
}

console.log(`[Summary] Wiped ${deletedCount} file(s). Fresh database will be created on next boot.`);
