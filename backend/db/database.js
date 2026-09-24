const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Ensure storage subdirectories exist
[config.STORAGE_DIR, config.BOOKS_DIR, config.COVERS_DIR, config.PAGES_DIR, config.GENERATED_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    dbInstance = new Database(config.DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      cover_path TEXT,
      content_type TEXT DEFAULT 'novel',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      word_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'unread',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(book_id, number);

    CREATE TABLE IF NOT EXISTS chapter_representations (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_representations_chapter ON chapter_representations(chapter_id, type);

    CREATE TABLE IF NOT EXISTS processing_jobs (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      chapter_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status);
    CREATE TABLE IF NOT EXISTS book_supporting_materials (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      source_site TEXT,
      author TEXT,
      content_type TEXT DEFAULT 'web',
      snippet TEXT,
      content TEXT,
      canonical_content TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_supporting_book_id ON book_supporting_materials(book_id);

    CREATE TABLE IF NOT EXISTS semantic_chunks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_id TEXT,
      sequence INTEGER DEFAULT 0,
      section_heading TEXT,
      content_type TEXT DEFAULT 'paragraph',
      text_content TEXT NOT NULL,
      canonical_json TEXT,
      source_reference TEXT,
      token_count INTEGER DEFAULT 0,
      content_hash TEXT,
      embedding_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_book_id ON semantic_chunks(book_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_chapter_id ON semantic_chunks(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_hash ON semantic_chunks(content_hash);

    CREATE TABLE IF NOT EXISTS book_representations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      canonical_content TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS editorial_outlines (
      outlineId TEXT PRIMARY KEY,
      collectionId TEXT,
      title TEXT NOT NULL,
      chapters TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_editorial_outlines_collection ON editorial_outlines(collectionId);

    CREATE INDEX IF NOT EXISTS idx_book_representations ON book_representations(book_id, type);

    CREATE TABLE IF NOT EXISTS paragraph_attributions (
      id                TEXT PRIMARY KEY,
      representation_id TEXT NOT NULL,
      paragraph_index   INTEGER NOT NULL,
      segments_json     TEXT NOT NULL,
      source_chunk_ids  TEXT NOT NULL,
      weights_json      TEXT NOT NULL,
      method            TEXT NOT NULL,
      confidence        TEXT NOT NULL,
      grounded          BOOLEAN NOT NULL,
      verified_at       TEXT NOT NULL,
      fell_back         BOOLEAN NOT NULL DEFAULT 0,
      fallback_reason   TEXT,
      FOREIGN KEY (representation_id) REFERENCES chapter_representations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_para_attr_rep ON paragraph_attributions(representation_id);
    CREATE INDEX IF NOT EXISTS idx_para_attr_rep_idx ON paragraph_attributions(representation_id, paragraph_index);
  `);

  // Migrate chapter_representations if foreign key constraint blocks cross_source outline chapters
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chapter_representations'").get();
  if (tableSql && tableSql.sql.includes('FOREIGN KEY (chapter_id) REFERENCES chapters')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_representations_v2 (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        book_id TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        provenance TEXT,
        synthesisType TEXT DEFAULT 'single_source',
        created_at TEXT NOT NULL
      );
      INSERT OR REPLACE INTO chapter_representations_v2 (id, chapter_id, book_id, type, content, metadata_json, created_at)
      SELECT id, chapter_id, book_id, type, content, metadata_json, created_at FROM chapter_representations;
      DROP TABLE chapter_representations;
      ALTER TABLE chapter_representations_v2 RENAME TO chapter_representations;
      CREATE INDEX IF NOT EXISTS idx_representations_chapter ON chapter_representations(chapter_id, type);
    `);
    db.pragma('foreign_keys = ON');
  }

  // Ensure provenance and synthesisType exist on chapter_representations
  const chapRepCols = db.prepare(`PRAGMA table_info(chapter_representations)`).all();
  if (!chapRepCols.some(c => c.name === 'provenance')) {
    db.exec(`ALTER TABLE chapter_representations ADD COLUMN provenance TEXT;`);
  }
  if (!chapRepCols.some(c => c.name === 'synthesisType')) {
    db.exec(`ALTER TABLE chapter_representations ADD COLUMN synthesisType TEXT DEFAULT 'single_source';`);
  }

  // Ensure canonical_content and updated_at exist in book_representations
  const repCols = db.prepare(`PRAGMA table_info(book_representations)`).all();
  if (!repCols.some(c => c.name === 'canonical_content')) {
    db.exec(`ALTER TABLE book_representations ADD COLUMN canonical_content TEXT;`);
  }
  if (!repCols.some(c => c.name === 'updated_at')) {
    db.exec(`ALTER TABLE book_representations ADD COLUMN updated_at TEXT;`);
  }

  // Ensure canonical_content column exists for structured block rendering
  const chapterCols = db.prepare(`PRAGMA table_info(chapters)`).all();
  if (!chapterCols.some(c => c.name === 'canonical_content')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN canonical_content TEXT;`);
  }
  if (!chapterCols.some(c => c.name === 'structural_role')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN structural_role TEXT DEFAULT 'chapter';`);
  }
  if (!chapterCols.some(c => c.name === 'section_count')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN section_count INTEGER DEFAULT 0;`);
  }
  if (!chapterCols.some(c => c.name === 'metadata_json')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN metadata_json TEXT DEFAULT '{}';`);
  }

  // Cleanup historical phantom books: processing with 0 chapters -> failed
  db.exec(`
    UPDATE books
    SET status = 'failed'
    WHERE status = 'processing'
      AND (SELECT COUNT(*) FROM chapters c WHERE c.book_id = books.id) = 0;
  `);

  // Ensure metadata columns exist on books table
  const bookCols = db.prepare(`PRAGMA table_info(books)`).all();
  if (!bookCols.some(c => c.name === 'status')) {
    db.exec(`ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'active';`);
  }
  if (!bookCols.some(c => c.name === 'source_format')) {
    db.exec(`ALTER TABLE books ADD COLUMN source_format TEXT DEFAULT 'text';`);
  }
  if (!bookCols.some(c => c.name === 'original_filename')) {
    db.exec(`ALTER TABLE books ADD COLUMN original_filename TEXT DEFAULT '';`);
  }
  if (!bookCols.some(c => c.name === 'page_count')) {
    db.exec(`ALTER TABLE books ADD COLUMN page_count INTEGER DEFAULT 1;`);
  }
  if (!bookCols.some(c => c.name === 'metadata_json')) {
    db.exec(`ALTER TABLE books ADD COLUMN metadata_json TEXT DEFAULT '{}';`);
  }
  if (!bookCols.some(c => c.name === 'source_url')) {
    db.exec(`ALTER TABLE books ADD COLUMN source_url TEXT DEFAULT '';`);
  }
  if (!bookCols.some(c => c.name === 'source_site')) {
    db.exec(`ALTER TABLE books ADD COLUMN source_site TEXT DEFAULT '';`);
  }
  if (!bookCols.some(c => c.name === 'section_count')) {
    db.exec(`ALTER TABLE books ADD COLUMN section_count INTEGER DEFAULT 0;`);
  }
  if (!bookCols.some(c => c.name === 'integrity_status')) {
    db.exec(`ALTER TABLE books ADD COLUMN integrity_status TEXT DEFAULT 'valid';`);
  }
  if (!bookCols.some(c => c.name === 'integrity_warning')) {
    db.exec(`ALTER TABLE books ADD COLUMN integrity_warning TEXT DEFAULT '';`);
  }
  if (!bookCols.some(c => c.name === 'semantic_status')) {
    db.exec(`ALTER TABLE books ADD COLUMN semantic_status TEXT DEFAULT 'unindexed';`);
  }
  if (!bookCols.some(c => c.name === 'semantic_chunk_count')) {
    db.exec(`ALTER TABLE books ADD COLUMN semantic_chunk_count INTEGER DEFAULT 0;`);
  }
  if (!bookCols.some(c => c.name === 'semantic_indexed_at')) {
    db.exec(`ALTER TABLE books ADD COLUMN semantic_indexed_at TEXT;`);
  }

  // Ensure provenance columns exist on semantic_chunks table
  // Ensure provenance and embedding_model columns exist on semantic_chunks table
  const chunkCols = db.prepare(`PRAGMA table_info(semantic_chunks)`).all();
  if (!chunkCols.some(c => c.name === 'source_page')) {
    db.exec(`ALTER TABLE semantic_chunks ADD COLUMN source_page INTEGER;`);
  }
  if (!chunkCols.some(c => c.name === 'structural_role')) {
    db.exec(`ALTER TABLE semantic_chunks ADD COLUMN structural_role TEXT DEFAULT 'body';`);
  }
  if (!chunkCols.some(c => c.name === 'embedding_model')) {
    db.exec(`ALTER TABLE semantic_chunks ADD COLUMN embedding_model TEXT DEFAULT 'bge-m3';`);
  }

  // Ensure type column exists on editorial_outlines
  const outlineCols = db.prepare(`PRAGMA table_info(editorial_outlines)`).all();
  if (!outlineCols.some(c => c.name === 'type')) {
    db.exec(`ALTER TABLE editorial_outlines ADD COLUMN type TEXT DEFAULT 'multi_source';`);
  }

  // Ensure interrupted_at column exists on processing_jobs
  const jobCols = db.prepare(`PRAGMA table_info(processing_jobs)`).all();
  if (!jobCols.some(c => c.name === 'interrupted_at')) {
    db.exec(`ALTER TABLE processing_jobs ADD COLUMN interrupted_at TEXT;`);
  }

  seedDefaultBookIfEmpty(db);
}

function resetAndSeedDatabase(db) {
  if (!db) db = getDatabase();
  
  db.transaction(() => {
    db.exec(`
      DELETE FROM paragraph_attributions;
      DELETE FROM semantic_chunks;
      DELETE FROM book_representations;
      DELETE FROM book_supporting_materials;
      DELETE FROM processing_jobs;
      DELETE FROM chapter_representations;
      DELETE FROM editorial_outlines;
      DELETE FROM chapters;
      DELETE FROM books;
    `);

    seedSampleBooks(db);
  })();

  return { success: true, message: 'Database reset and seeded successfully' };
}

function seedDefaultBookIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM books').get().count;
  if (count === 0) {
    seedSampleBooks(db);
  }
}

function seedSampleBooks(db) {
  const now = new Date().toISOString();

  // Book 1: The Clockwork Astral Academy (Fantasy / Light Novel)
  const book1Id = 'book-sample-lightnovel-1';
  db.prepare(`
    INSERT INTO books (id, title, author, description, cover_path, content_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    book1Id,
    'The Clockwork Astral Academy',
    'Kaelen Voss',
    'In a floating archipelago powered by celestial ether, an aspiring chronomancer discovers an ancient pocket clock that records future anomalies before they happen.',
    'covers/default-clockwork.png',
    'novel',
    'active',
    now,
    now
  );

  const ch1Content = `The bells of St. Sophia's Campanile chimed seven times across the upper sky-terraces, their brass resonance muffled by the dense silver fog that rose from the lower ether springs.

Caspian adjusted the copper gear-pins of his brass gauntlet. The tension spring was vibrating at three beats per second—too fast for normal atmospheric pressure. Something out in the Meridian Verge was distorting the local temporal drift.

"You're late again, Caspian," whispered Lyra, appearing from behind the towering steam-manifold. Her goggles reflected the amber luminescence of the academy courtyard. "Professor Vane has already sealed the lecture vault. If you're caught wandering the machinery tiers during harmonic stabilization, they'll confiscate your certification parchment."

"The harmonic balance is off, Lyra," Caspian answered, holding up his wrist. The second hand on his chronometer clicked backward by two seconds, shuddered, and then resumed its forward rotation. "Did you feel that tremor in the floor plates?"

Lyra frowned, checking her own ether-barometer. The mercury inside was bubbling faintly. "That's impossible. The central gyroscope was calibrated this dawn."

"Unless someone didn't calibrate it," Caspian said, looking toward the Observatory spires. "Or unless someone intentionally loosened the anchor pin to let the future leak in."`;

  const ch1Canonical = JSON.stringify([
    { type: 'paragraph', text: "The bells of St. Sophia's Campanile chimed seven times across the upper sky-terraces, their brass resonance muffled by the dense silver fog that rose from the lower ether springs." },
    { type: 'paragraph', text: "Caspian adjusted the copper gear-pins of his brass gauntlet. The tension spring was vibrating at three beats per second—too fast for normal atmospheric pressure. Something out in the Meridian Verge was distorting the local temporal drift." },
    { type: 'paragraph', text: "\"You're late again, Caspian,\" whispered Lyra, appearing from behind the towering steam-manifold. Her goggles reflected the amber luminescence of the academy courtyard. \"Professor Vane has already sealed the lecture vault. If you're caught wandering the machinery tiers during harmonic stabilization, they'll confiscate your certification parchment.\"" },
    { type: 'paragraph', text: "\"The harmonic balance is off, Lyra,\" Caspian answered, holding up his wrist. The second hand on his chronometer clicked backward by two seconds, shuddered, and then resumed its forward rotation. \"Did you feel that tremor in the floor plates?\"" },
    { type: 'paragraph', text: "Lyra frowned, checking her own ether-barometer. The mercury inside was bubbling faintly. \"That's impossible. The central gyroscope was calibrated this dawn.\"" },
    { type: 'paragraph', text: "\"Unless someone didn't calibrate it,\" Caspian said, looking toward the Observatory spires. \"Or unless someone intentionally loosened the anchor pin to let the future leak in.\"" }
  ]);

  db.prepare(`
    INSERT INTO chapters (id, book_id, number, title, content, canonical_content, word_count, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ch-clockwork-1',
    book1Id,
    1,
    'Chapter 1: The Leaking Clockwork',
    ch1Content,
    ch1Canonical,
    ch1Content.split(/\s+/).length,
    'read',
    now,
    now
  );

  const ch2Content = `The descent to the sub-atrium smelled of ozone and hot lubricating oil. Giant copper valves hummed with high-frequency resonance as steam hissed from safety relief valves along the bulkhead.

"We shouldn't be here," Lyra muttered, her boots ringing against the iron grating. "The restricted level is monitored by the automaton wardens."

"The wardens are currently stationed at the north exhaust duct," Caspian whispered, pointing toward a disabled sentinel slumped against the archway. A strange crystalline frost coated its drive gears—frost that burned with a faint ultraviolet glow.

"Temporal crystallization," Lyra gasped, kneeling beside the automaton. "The temporal core ruptured. Whoever did this was looking for the Astral Cartography ledger."

Before Caspian could answer, the iron door at the far end of the corridor groaned open. Heavy footsteps echoed through the steam haze, accompanied by the distinct rhythmic ticking of a heart forged from black iron.`;

  const ch2Canonical = JSON.stringify([
    { type: 'paragraph', text: "The descent to the sub-atrium smelled of ozone and hot lubricating oil. Giant copper valves hummed with high-frequency resonance as steam hissed from safety relief valves along the bulkhead." },
    { type: 'paragraph', text: "\"We shouldn't be here,\" Lyra muttered, her boots ringing against the iron grating. \"The restricted level is monitored by the automaton wardens.\"" },
    { type: 'paragraph', text: "\"The wardens are currently stationed at the north exhaust duct,\" Caspian whispered, pointing toward a disabled sentinel slumped against the archway. A strange crystalline frost coated its drive gears—frost that burned with a faint ultraviolet glow." },
    { type: 'paragraph', text: "\"Temporal crystallization,\" Lyra gasped, kneeling beside the automaton. \"The temporal core ruptured. Whoever did this was looking for the Astral Cartography ledger.\"" },
    { type: 'paragraph', text: "Before Caspian could answer, the iron door at the far end of the corridor groaned open. Heavy footsteps echoed through the steam haze, accompanied by the distinct rhythmic ticking of a heart forged from black iron." }
  ]);

  db.prepare(`
    INSERT INTO chapters (id, book_id, number, title, content, canonical_content, word_count, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ch-clockwork-2',
    book1Id,
    2,
    'Chapter 2: The Automaton Crypt',
    ch2Content,
    ch2Canonical,
    ch2Content.split(/\s+/).length,
    'reading',
    now,
    now
  );

  // Chapter 1 sample summary representation (decoupled, does not alter original text)
  db.prepare(`
    INSERT INTO chapter_representations (id, chapter_id, book_id, type, content, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'rep-sample-clockwork-1',
    'ch-clockwork-1',
    book1Id,
    'SUMMARY',
    `• Key Narrative Milestones:
1. Caspian observes temporal instability as his brass chronometer ticks backward during harmonic stabilization.
2. Lyra urges caution and notes that Professor Vane has sealed the lecture vaults.
3. The atmospheric ether-barometer detects unexplained bubbling, suggesting deliberate tampering with the central gyroscope anchor.

• Literary Significance:
Establishes the tension between clockwork order and temporal flux within the Floating Archipelago.`,
    JSON.stringify({ model: 'llama3', provider: 'ollama', executionTimeMs: 1250 }),
    now
  );

  // Book 2: Principles of Intelligent Synthesis (Textbook / Research Paper)
  const book2Id = 'book-sample-textbook-2';
  db.prepare(`
    INSERT INTO books (id, title, author, description, cover_path, content_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    book2Id,
    'Principles of Intelligent Synthesis',
    'Dr. Elena Vance',
    'A foundational guide to knowledge structuring, decoupled representations, and modern cognitive ergonomics in digital libraries.',
    '',
    'textbook',
    'active',
    now,
    now
  );

  const book2Ch1Raw = `# Architectural Foundations

The primary challenge of modern information systems is not the acquisition of raw data, but the fidelity with which knowledge is retained and transformed.

> "A library is neither a warehouse of dead text nor a machine of automated noise; it is an active mirror of human inquiry."

Key architectural tenets:
- Immutability of source material
- Decoupling of original text from machine representations
- Multi-modal transformations on demand

---

## Canonical Normalization

When documents are ingested across disparate formats—Markdown, plain text, or future scans—the reading surface should remain consistent. A unified block hierarchy prevents presentation defects from obscuring meaning.`;

  const book2Ch1Canonical = JSON.stringify([
    { type: 'heading', level: 1, text: 'Architectural Foundations' },
    { type: 'paragraph', text: 'The primary challenge of modern information systems is not the acquisition of raw data, but the fidelity with which knowledge is retained and transformed.' },
    { type: 'quote', text: 'A library is neither a warehouse of dead text nor a machine of automated noise; it is an active mirror of human inquiry.' },
    { type: 'paragraph', text: 'Key architectural tenets:' },
    { type: 'list', ordered: false, items: [
      'Immutability of source material',
      'Decoupling of original text from machine representations',
      'Multi-modal transformations on demand'
    ]},
    { type: 'separator' },
    { type: 'heading', level: 2, text: 'Canonical Normalization' },
    { type: 'paragraph', text: 'When documents are ingested across disparate formats—Markdown, plain text, or future scans—the reading surface should remain consistent. A unified block hierarchy prevents presentation defects from obscuring meaning.' }
  ]);

  db.prepare(`
    INSERT INTO chapters (id, book_id, number, title, content, canonical_content, word_count, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ch-textbook-1',
    book2Id,
    1,
    'Architectural Foundations',
    book2Ch1Raw,
    book2Ch1Canonical,
    book2Ch1Raw.split(/\s+/).length,
    'unread',
    now,
    now
  );

  // Auto-index sample books into Semantic Memory
  try {
    const semanticLifecycle = require('../services/semantic/semanticLifecycle');
    semanticLifecycle.indexBook(book1Id, { skipJob: true }).catch((e) => console.warn('Sample book 1 index error:', e.message));
    semanticLifecycle.indexBook(book2Id, { skipJob: true }).catch((e) => console.warn('Sample book 2 index error:', e.message));
  } catch (err) {
    console.warn('Could not trigger semantic indexing for sample books:', err.message);
  }
}

function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore if already closed
    }
    dbInstance = null;
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  resetAndSeedDatabase,
};
