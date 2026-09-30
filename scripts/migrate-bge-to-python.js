#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../backend/config');
const embedClient = require('../backend/services/ai/embedClient');
const dbModule = require('../backend/db/database');

async function migrate() {
  if (process.env.USE_PYTHON_EMBEDDER !== 'true') {
    console.error("process.env.USE_PYTHON_EMBEDDER must be 'true'");
    process.exit(1);
  }

  if (!fs.existsSync(config.DB_PATH)) {
    console.error(`DB_PATH does not exist: ${config.DB_PATH}`);
    process.exit(1);
  }

  const sidecarUrl = config.PYTHON_SIDECAR_URL || 'http://127.0.0.1:8765';
  try {
    const res = await fetch(`${sidecarUrl}/v1/health`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error('Sidecar not returning 200');
  } catch (err) {
    console.error('Sidecar /v1/health failed:', err);
    process.exit(1);
  }

  const backupDir = path.join(path.dirname(config.DB_PATH), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  const backupPath = path.join(backupDir, `smart_reader_pre_bge_migration_${timestamp}.db`);
  
  fs.copyFileSync(config.DB_PATH, backupPath);
  
  const sourceStats = fs.statSync(config.DB_PATH);
  const backupStats = fs.statSync(backupPath);
  if (sourceStats.size !== backupStats.size) {
    console.error(`Backup size mismatch: ${sourceStats.size} != ${backupStats.size}`);
    process.exit(1);
  }

  const db = dbModule.getDatabase();

  try {
    db.exec(`DROP TABLE IF EXISTS semantic_chunks_v2;`);
    
    db.exec(`
      CREATE TABLE semantic_chunks_v2 (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        chapter_id TEXT,
        sequence INTEGER,
        section_heading TEXT,
        content_type TEXT DEFAULT 'paragraph',
        text_content TEXT NOT NULL,
        embedding_json TEXT,
        embedding_model TEXT DEFAULT 'bge-m3-python-fp32',
        canonical_json TEXT,
        source_reference TEXT,
        token_count INTEGER,
        content_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_page INTEGER,
        structural_role TEXT DEFAULT 'content',
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      );
    `);

    const rows = db.prepare(`SELECT * FROM semantic_chunks`).all();
    console.log(`Found ${rows.length} rows to migrate.`);

    const insertStmt = db.prepare(`
      INSERT INTO semantic_chunks_v2 (
        id, book_id, chapter_id, sequence, section_heading, content_type,
        text_content, canonical_json, source_reference, token_count,
        content_hash, created_at, updated_at, source_page, structural_role,
        embedding_json, embedding_model
      ) VALUES (
        @id, @book_id, @chapter_id, @sequence, @section_heading, @content_type,
        @text_content, @canonical_json, @source_reference, @token_count,
        @content_hash, @created_at, @updated_at, @source_page, @structural_role,
        @embedding_json, @embedding_model
      )
    `);

    let processed = 0;
    const BATCH_SIZE = 8;
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const texts = batch.map(r => r.text_content);
      
      const result = await embedClient.embedBatch(texts);
      const embeddings = result.embeddings;

      const insertTransaction = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          row.embedding_json = JSON.stringify(embeddings[j]);
          row.embedding_model = 'bge-m3-python-fp32';
          insertStmt.run(row);
        }
      });
      insertTransaction();

      processed += batch.length;
      if (processed % 50 === 0 || processed === rows.length) {
        console.log(`Migrated ${processed} / ${rows.length} chunks...`);
      }
    }

    const countV1 = db.prepare(`SELECT COUNT(*) as c FROM semantic_chunks`).get().c;
    const countV2 = db.prepare(`SELECT COUNT(*) as c FROM semantic_chunks_v2`).get().c;

    if (countV1 !== countV2) {
      throw new Error(`Sanity check failed: v1 (${countV1}) != v2 (${countV2})`);
    }

    db.transaction(() => {
      db.exec(`ALTER TABLE semantic_chunks RENAME TO semantic_chunks_old;`);
      db.exec(`ALTER TABLE semantic_chunks_v2 RENAME TO semantic_chunks;`);
      db.exec(`DROP TABLE semantic_chunks_old;`);
    })();

    console.log(`Migration completed successfully.`);
    console.log(`Backup saved to: ${backupPath}`);
  } catch (err) {
    console.error('Migration failed:', err);
    try {
      db.exec(`DROP TABLE IF EXISTS semantic_chunks_v2;`);
    } catch (dropErr) {
      console.error('Failed to drop semantic_chunks_v2 during rollback:', dropErr);
    }
    console.error(`Backup is available at: ${backupPath}`);
    process.exit(1);
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
