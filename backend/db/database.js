const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const LocalEmbeddingProvider = require('../services/semantic/embeddings/localEmbeddingProvider');
const embeddingProvider = new LocalEmbeddingProvider();
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
    runPendingMigrations(dbInstance);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function runPendingMigrations(db) {
  let version = db.pragma('user_version', { simple: true });

  if (version < 1) {
    // Migration 1: smart_chapters + paragraph_attributions rebuild
    db.exec(`
    CREATE TABLE IF NOT EXISTS smart_chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      planned_source_section_ids TEXT,
      planned_word_count INTEGER,
      content TEXT,
      synthesis_type TEXT,
      metadata_json TEXT,
      opened_at TEXT,
      read_at TEXT,
      read_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_smart_chapters_book_seq
      ON smart_chapters(book_id, sequence);

    DROP TABLE IF EXISTS paragraph_attributions;

    CREATE TABLE IF NOT EXISTS paragraph_attributions (
      id TEXT PRIMARY KEY,
      smart_chapter_id TEXT NOT NULL,
      paragraph_index INTEGER NOT NULL,
      segments_json TEXT NOT NULL,
      source_chunk_ids TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      method TEXT NOT NULL,
      confidence TEXT NOT NULL,
      grounded BOOLEAN NOT NULL,
      verified_at TEXT NOT NULL,
      fell_back BOOLEAN NOT NULL DEFAULT 0,
      fallback_reason TEXT,
      FOREIGN KEY (smart_chapter_id) REFERENCES smart_chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_para_attr_chapter
      ON paragraph_attributions(smart_chapter_id, paragraph_index);
  `);

  db.pragma('user_version = 1');
  version = 1;
}

if (version < 2) {
  db.exec(`
    ALTER TABLE paragraph_attributions
    ADD COLUMN reranker_scores_json TEXT DEFAULT '{}';
  `);
  db.pragma('user_version = 2');
  version = 2;
}
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
      smart_chapter_id  TEXT NOT NULL,
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
      reranker_scores_json TEXT DEFAULT '{}',
      FOREIGN KEY (smart_chapter_id) REFERENCES smart_chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_para_attr_chapter ON paragraph_attributions(smart_chapter_id, paragraph_index);
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

  // Cleanup historical markdown leakage in books.description
  try {
    const aiNormalizer = require('../services/ai/aiNormalizer');
    const mdBooks = db.prepare("SELECT id, description FROM books WHERE description LIKE '%**%'").all();
    for (const b of mdBooks) {
      if (b.description) {
        db.prepare('UPDATE books SET description = ? WHERE id = ?')
          .run(aiNormalizer.stripMarkdownSymbols(b.description), b.id);
      }
    }
  } catch (err) {
    console.warn('[DB Migration] books.description markdown cleanup skipped:', err.message);
  }

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

  // Backfill books.author from metadata_json.bibliographic.authors if author is 'Unknown Author' or empty
  try {
    const booksWithUnknownAuthor = db.prepare("SELECT id, author, metadata_json FROM books WHERE author IS NULL OR author = '' OR author = 'Unknown Author'").all();
    for (const b of booksWithUnknownAuthor) {
      if (!b.metadata_json) continue;
      try {
        const meta = typeof b.metadata_json === 'string' ? JSON.parse(b.metadata_json) : b.metadata_json;
        if (meta && meta.bibliographic && Array.isArray(meta.bibliographic.authors) && meta.bibliographic.authors.length > 0) {
          const clean = meta.bibliographic.authors.map(a => (typeof a === 'string' ? a.trim() : '')).filter(Boolean);
          if (clean.length > 0) {
            let authorStr = clean[0];
            if (clean.length === 2) {
              authorStr = `${clean[0]} and ${clean[1]}`;
            } else if (clean.length > 2) {
              authorStr = `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
            }
            db.prepare("UPDATE books SET author = ?, updated_at = ? WHERE id = ?").run(authorStr, new Date().toISOString(), b.id);
          }
        }
      } catch {}
    }
  } catch {}

  seedDefaultBookIfEmpty(db);
}

function resetAndSeedDatabase(db) {
  if (!db) db = getDatabase();
  
  db.transaction(() => {
    db.exec(`
      DELETE FROM paragraph_attributions;
      DELETE FROM smart_chapters;
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

  const insertBook = db.prepare(`
    INSERT INTO books (
      id, title, author, description, cover_path, content_type, status,
      original_filename, source_site, source_url, section_count, integrity_status,
      semantic_status, semantic_chunk_count, semantic_indexed_at,
      metadata_json,
      created_at, updated_at
    ) VALUES (
      @id, @title, @author, @description, @cover_path, @content_type, @status,
      @original_filename, @source_site, @source_url, @section_count, @integrity_status,
      @semantic_status, @semantic_chunk_count, @semantic_indexed_at,
      @metadata_json,
      @created_at, @updated_at
    )
  `);

  const insertChapter = db.prepare(`
    INSERT INTO chapters (
      id, book_id, number, title, content, canonical_content, word_count, status, created_at, updated_at
    ) VALUES (
      @id, @book_id, @number, @title, @content, @canonical_content, @word_count, @status, @created_at, @updated_at
    )
  `);

  const insertChunk = db.prepare(`
    INSERT INTO semantic_chunks (
      id, book_id, chapter_id, sequence, section_heading, content_type, text_content,
      canonical_json, source_reference, token_count, content_hash, embedding_json,
      embedding_model, structural_role, created_at, updated_at
    ) VALUES (
      @id, @book_id, @chapter_id, @sequence, @section_heading, @content_type, @text_content,
      @canonical_json, @source_reference, @token_count, @content_hash, @embedding_json,
      'bge-m3', 'body', @created_at, @updated_at
    )
  `);

  const insertOutline = db.prepare(`
    INSERT INTO editorial_outlines (
      outlineId, collectionId, title, chapters, type, createdAt
    ) VALUES (
      @outlineId, @collectionId, @title, @chapters, @type, @createdAt
    )
  `);

  const insertSmartChapter = db.prepare(`
    INSERT INTO smart_chapters (
      id, book_id, sequence, title, status, planned_source_section_ids, planned_word_count,
      content, synthesis_type, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @book_id, @sequence, @title, @status, @planned_source_section_ids, @planned_word_count,
      @content, @synthesis_type, @metadata_json, @created_at, @updated_at
    )
  `);

  const insertAttribution = db.prepare(`
    INSERT INTO paragraph_attributions (
      id, smart_chapter_id, paragraph_index, segments_json, source_chunk_ids,
      weights_json, method, confidence, grounded, verified_at, fell_back, fallback_reason
    ) VALUES (
      @id, @smart_chapter_id, @paragraph_index, @segments_json, @source_chunk_ids,
      @weights_json, @method, @confidence, @grounded, @verified_at, @fell_back, @fallback_reason
    )
  `);

  const insertSummaryRep = db.prepare(`
    INSERT INTO chapter_representations (
      id, chapter_id, book_id, type, content, metadata_json, created_at
    ) VALUES (
      @id, @chapter_id, @book_id, @type, @content, @metadata_json, @created_at
    )
  `);

  let fixtureVectors = {}; try { fixtureVectors = require('./fixture_vectors.json'); } catch(e){} function addChunk(bookId, chapterId, chunkId, seq, heading, text) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const tokenCount = Math.ceil(text.split(/\s+/).length * 1.3);
    const embedding = (fixtureVectors[chunkId]) || embeddingProvider.embedTextSync(text);
    insertChunk.run({
      id: chunkId,
      book_id: bookId,
      chapter_id: chapterId,
      sequence: seq,
      section_heading: heading,
      content_type: 'paragraph',
      text_content: text,
      canonical_json: JSON.stringify([{ type: 'paragraph', text }]),
      source_reference: `${heading} (Section ${seq + 1})`,
      token_count: tokenCount,
      content_hash: hash,
      embedding_json: JSON.stringify(embedding),
      created_at: now,
      updated_at: now,
    });
  }

  // =========================================================================
  // FIXTURE A — Minimal Book (book-fixture-a)
  // 2 source chapters, 3 smart_chapters (2 generated, 1 pending), c_primary only
  // =========================================================================
  const bookAId = 'book-fixture-a';
  insertBook.run({
    id: bookAId,
    title: 'Foundations of Neural Dynamics',
    author: 'Dr. Aris Thorne',
    description: 'Mathematical foundations of continuous attractor networks, energy landscapes, and dynamical convergence.',
    cover_path: 'covers/default-neural.png',
    content_type: 'textbook',
    status: 'active',
    original_filename: 'neural_dynamics.txt',
    source_site: 'University Press',
    source_url: 'https://example.edu/neural-dynamics',
    section_count: 2,
    integrity_status: 'valid',
    semantic_status: 'indexed',
    semantic_chunk_count: 4,
    semantic_indexed_at: now,
    metadata_json: JSON.stringify({
      classification: {
        contentType: 'textbook',
        tags: ['neural-dynamics', 'attractor-networks'],
        readingLevel: 'advanced',
      },
      bibliographic: {
        publisher: 'University Press',
        publication_year: 2024,
        isbn: '978-0-262-12345-6',
        edition: 'First edition',
        authors: ['Dr. Aris Thorne'],
        language: 'en',
        fell_back: false,
      },
    }),
    created_at: now,
    updated_at: now,
  });

  const faCh1Text = `Linear attractor networks represent continuous variables along low-dimensional manifolds in neural firing space. The network topology dictates the stability of steady states under external perturbation, allowing neural circuits to preserve analog state values against ambient thermal and synaptic noise. Recurrent connections within these manifolds distribute internal representations across large neural populations, ensuring that localized lesions or noise perturbations do not catastrophically disrupt stored information. The precise geometry of the manifold encodes the range of representable states, with the intrinsic curvature reflecting the computational capacity of the underlying circuit architecture. As recurrent excitation balances feedforward inhibition, the system converges toward stable equilibrium points across the energy landscape. Energy minima correspond to memory states, while saddle points demarcate decision thresholds during perceptual discrimination tasks. The steepness of the gradient near each minimum determines how quickly the network recovers from perturbation, with sharper basins indicating stronger attractor pull and faster state restoration. Bifurcation analyses reveal that small parameter changes can shift the network between regimes of discrete memory storage and continuous parameter tracking.`;
  const faCh1Blocks = [
    { type: 'heading', level: 1, text: 'Linear Attractors and Vector Spaces' },
    { type: 'paragraph', text: 'Linear attractor networks represent continuous variables along low-dimensional manifolds in neural firing space. The network topology dictates the stability of steady states under external perturbation, allowing neural circuits to preserve analog state values against ambient thermal and synaptic noise. Recurrent connections within these manifolds distribute internal representations across large neural populations, ensuring that localized lesions or noise perturbations do not catastrophically disrupt stored information. The precise geometry of the manifold encodes the range of representable states, with the intrinsic curvature reflecting the computational capacity of the underlying circuit architecture.' },
    { type: 'paragraph', text: 'As recurrent excitation balances feedforward inhibition, the system converges toward stable equilibrium points across the energy landscape. Energy minima correspond to memory states, while saddle points demarcate decision thresholds during perceptual discrimination tasks. The steepness of the gradient near each minimum determines how quickly the network recovers from perturbation, with sharper basins indicating stronger attractor pull and faster state restoration. Bifurcation analyses reveal that small parameter changes can shift the network between regimes of discrete memory storage and continuous parameter tracking, a transition exploited by working memory circuits during cognitive control tasks.' }
  ];
  insertChapter.run({
    id: 'ch-fa-1',
    book_id: bookAId,
    number: 1,
    title: 'Linear Attractors and Vector Spaces',
    content: faCh1Text,
    canonical_content: JSON.stringify(faCh1Blocks),
    word_count: faCh1Text.split(/\s+/).length,
    status: 'read',
    created_at: now,
    updated_at: now,
  });
  addChunk(bookAId, 'ch-fa-1', 'chunk-fa-1-1', 0, 'Manifold Representation', faCh1Blocks[1].text);
  addChunk(bookAId, 'ch-fa-1', 'chunk-fa-1-2', 1, 'Energy Landscapes and Minima', faCh1Blocks[2].text);

  const faCh2Text = `Gradient vector fields govern the trajectories of recurrent neural states toward localized minimum-energy attractors. Symmetric synaptic connectivity ensures quadratic energy dissipation, preventing chaotic oscillations in asynchronous updating schemes. The Lyapunov energy function decreases monotonically during asynchronous neuron updates, guaranteeing convergence to a fixed point rather than a limit cycle or chaotic attractor. This convergence property makes symmetric Hopfield networks analytically tractable, enabling closed-form calculation of storage capacity and retrieval error rates as functions of network size and connection density. Under non-symmetric coupling, quasi-periodic limit cycles emerge, modeling central pattern generators and biological rhythmic behavior. The transition between fixed-point attractors and limit cycles represents a supercritical Hopf bifurcation driven by neuromodulatory tone. Acetylcholine and dopamine selectively reduce the magnitude of feedback inhibition, shifting the eigenvalue spectrum of the connectivity matrix toward the imaginary axis and destabilizing fixed points.`;
  const faCh2Blocks = [
    { type: 'heading', level: 1, text: 'Gradient Fields and Convergence' },
    { type: 'paragraph', text: 'Gradient vector fields govern the trajectories of recurrent neural states toward localized minimum-energy attractors. Symmetric synaptic connectivity ensures quadratic energy dissipation, preventing chaotic oscillations in asynchronous updating schemes. The Lyapunov energy function decreases monotonically during asynchronous neuron updates, guaranteeing convergence to a fixed point rather than a limit cycle or chaotic attractor. This convergence property makes symmetric Hopfield networks analytically tractable, enabling closed-form calculation of storage capacity and retrieval error rates as functions of network size and connection density.' },
    { type: 'paragraph', text: 'Under non-symmetric coupling, quasi-periodic limit cycles emerge, modeling central pattern generators and biological rhythmic behavior. The transition between fixed-point attractors and limit cycles represents a supercritical Hopf bifurcation driven by neuromodulatory tone. Acetylcholine and dopamine selectively reduce the magnitude of feedback inhibition, shifting the eigenvalue spectrum of the connectivity matrix toward the imaginary axis and destabilizing fixed points. The resulting oscillatory dynamics can be entrained to rhythmic sensory input, synchronizing neural populations across cortical areas and enabling temporally coordinated motor sequences and cognitive bindings.' }
  ];
  insertChapter.run({
    id: 'ch-fa-2',
    book_id: bookAId,
    number: 2,
    title: 'Gradient Fields and Convergence',
    content: faCh2Text,
    canonical_content: JSON.stringify(faCh2Blocks),
    word_count: faCh2Text.split(/\s+/).length,
    status: 'read',
    created_at: now,
    updated_at: now,
  });
  addChunk(bookAId, 'ch-fa-2', 'chunk-fa-2-1', 0, 'Quadratic Energy Dissipation', faCh2Blocks[1].text);
  addChunk(bookAId, 'ch-fa-2', 'chunk-fa-2-2', 1, 'Limit Cycles & Bifurcations', faCh2Blocks[2].text);

  insertOutline.run({
    outlineId: `book-editorial-${bookAId}`,
    collectionId: bookAId,
    title: 'Omni Reading: Foundations of Neural Dynamics',
    type: 'single_book',
    chapters: JSON.stringify([
      { id: `smart-${bookAId}-ch-1`, chapterId: `smart-${bookAId}-ch-1`, sequence: 1, title: 'Linear Dynamics and Phase Space', targetWordCount: 210, sourceSectionIds: ['chunk-fa-1-1', 'chunk-fa-1-2'] },
      { id: `smart-${bookAId}-ch-2`, chapterId: `smart-${bookAId}-ch-2`, sequence: 2, title: 'Gradient Convergence in Neural Manifolds', targetWordCount: 210, sourceSectionIds: ['chunk-fa-2-1', 'chunk-fa-2-2'] },
      { id: `smart-${bookAId}-ch-3`, chapterId: `smart-${bookAId}-ch-3`, sequence: 3, title: 'Stochastic Stability and Limit Cycles', targetWordCount: 240, sourceSectionIds: ['chunk-fa-1-2', 'chunk-fa-2-1'] },
    ]),
    createdAt: now,
  });

  const faSmartCh1Text = `Continuous attractor neural networks maintain internal representations of analog variables by stabilizing continuous manifolds of fixed points. When symmetric recurrent connections balance feedforward sensory signals, state trajectories flow smoothly along flat directions corresponding to preserved analog coordinates.\n\nSynaptic noise and thermal fluctuations produce diffusive drift along neutral manifold directions unless counteracted by localized negative feedback loops. The geometry of the energy landscape determines whether the system retains absolute coordinate values or decays toward baseline firing rates.\n\nDecision thresholds and working memory retention reflect deep parabolic basins of attraction across multidimensional neural firing spaces. By tuning excitation-inhibition ratios, neuromodulatory signals adjust landscape curvature dynamically to match task demands.`;
  const faSmartCh1Words = faSmartCh1Text.trim().split(/\s+/).length;
  insertSmartChapter.run({
    id: `smart-${bookAId}-ch-1`,
    book_id: bookAId,
    sequence: 1,
    title: 'Linear Dynamics and Phase Space',
    status: 'generated',
    planned_source_section_ids: JSON.stringify(['chunk-fa-1-1', 'chunk-fa-1-2']),
    planned_word_count: 210,
    content: faSmartCh1Text,
    synthesis_type: 'single_book',
    metadata_json: JSON.stringify({
      outlineId: `book-editorial-${bookAId}`,
      chapterId: `smart-${bookAId}-ch-1`,
      title: 'Linear Dynamics and Phase Space',
      grounded: true,
      chunkCount: 2,
      provenance: ['chunk-fa-1-1', 'chunk-fa-1-2'],
      canonicalBlocks: [
        { type: 'paragraph', text: faSmartCh1Text.split('\n\n')[0] },
        { type: 'paragraph', text: faSmartCh1Text.split('\n\n')[1] },
        { type: 'paragraph', text: faSmartCh1Text.split('\n\n')[2] },
      ],
      provider: 'deterministic_synthesizer',
      model: 'smart_reader_v4',
      generatedAt: now,
      actual_word_count: faSmartCh1Words,
      source_word_count: faSmartCh1Words * 7,
    }),
    created_at: now,
    updated_at: now,
  });

  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fa-1-${pIdx}`,
      smart_chapter_id: `smart-${bookAId}-ch-1`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: pIdx === 2 ? 'chunk-fa-1-2' : 'chunk-fa-1-1', confidence: 0.94 }]),
      source_chunk_ids: JSON.stringify([pIdx === 2 ? 'chunk-fa-1-2' : 'chunk-fa-1-1']),
      weights_json: JSON.stringify({ [pIdx === 2 ? 'chunk-fa-1-2' : 'chunk-fa-1-1']: 1.0 }),
      method: 'c_primary',
      confidence: 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  const faSmartCh2Text = `State trajectories in symmetric recurrent networks follow deterministic gradient descents across Lyapunov energy surfaces. Because energy strictly decreases during state updates, chaotic fluctuations and divergent cycles are mathematically precluded from occurring under asynchronous update schedules.\n\nIntroducing asymmetric coupling matrices breaks energy conservation and permits stable limit cycles to emerge within the state space. Such limit cycle dynamics provide robust biological pacemakers capable of sustaining rhythmic motor patterns and temporal coordination.\n\nSupercritical Hopf bifurcations govern the continuous transition between static point attractors and periodic rhythmic orbits. Experimental observations confirm that tonic neuromodulatory depolarization shifts the operating regime seamlessly between memory storage and oscillatory motor output.`;
  const faSmartCh2Words = faSmartCh2Text.trim().split(/\s+/).length;
  insertSmartChapter.run({
    id: `smart-${bookAId}-ch-2`,
    book_id: bookAId,
    sequence: 2,
    title: 'Gradient Convergence in Neural Manifolds',
    status: 'generated',
    planned_source_section_ids: JSON.stringify(['chunk-fa-2-1', 'chunk-fa-2-2']),
    planned_word_count: 210,
    content: faSmartCh2Text,
    synthesis_type: 'single_book',
    metadata_json: JSON.stringify({
      outlineId: `book-editorial-${bookAId}`,
      chapterId: `smart-${bookAId}-ch-2`,
      title: 'Gradient Convergence in Neural Manifolds',
      grounded: true,
      chunkCount: 2,
      provenance: ['chunk-fa-2-1', 'chunk-fa-2-2'],
      canonicalBlocks: [
        { type: 'paragraph', text: faSmartCh2Text.split('\n\n')[0] },
        { type: 'paragraph', text: faSmartCh2Text.split('\n\n')[1] },
        { type: 'paragraph', text: faSmartCh2Text.split('\n\n')[2] },
      ],
      provider: 'deterministic_synthesizer',
      model: 'smart_reader_v4',
      generatedAt: now,
      actual_word_count: faSmartCh2Words,
      source_word_count: faSmartCh2Words * 7,
    }),
    created_at: now,
    updated_at: now,
  });

  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fa-2-${pIdx}`,
      smart_chapter_id: `smart-${bookAId}-ch-2`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: pIdx === 0 ? 'chunk-fa-2-1' : 'chunk-fa-2-2', confidence: 0.92 }]),
      source_chunk_ids: JSON.stringify([pIdx === 0 ? 'chunk-fa-2-1' : 'chunk-fa-2-2']),
      weights_json: JSON.stringify({ [pIdx === 0 ? 'chunk-fa-2-1' : 'chunk-fa-2-2']: 1.0 }),
      method: 'c_primary',
      confidence: 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  insertSmartChapter.run({
    id: `smart-${bookAId}-ch-3`,
    book_id: bookAId,
    sequence: 3,
    title: 'Stochastic Stability and Limit Cycles',
    status: 'pending',
    planned_source_section_ids: JSON.stringify(['chunk-fa-1-2', 'chunk-fa-2-1']),
    planned_word_count: 240,
    content: null,
    synthesis_type: 'single_book',
    metadata_json: null,
    created_at: now,
    updated_at: now,
  });

  // =========================================================================
  // FIXTURE B — Realistic Book (book-fixture-b)
  // 6 source chapters, 8 smart_chapters (5 generated, 2 pending, 1 failed)
  // paragraph_attributions cover: c_primary, c_verified_by_a, b_arbitrated, ungrounded
  // =========================================================================
  const bookBId = 'book-fixture-b';
  insertBook.run({
    id: bookBId,
    title: 'Practical Machine Learning and Distributed Systems',
    author: 'Elena Vance & Marcus Brody',
    description: 'A comprehensive treatment of distributed consensus, replicated state machines, and high-throughput machine learning infrastructure.',
    cover_path: 'covers/default-distributed.png',
    content_type: 'technical',
    status: 'active',
    original_filename: 'practical_machine_learning.pdf',
    source_site: 'Systems Engineering Press',
    source_url: 'https://example.org/practical-ml-distributed',
    section_count: 6,
    integrity_status: 'valid',
    semantic_status: 'indexed',
    semantic_chunk_count: 12,
    semantic_indexed_at: now,
    metadata_json: JSON.stringify({
      classification: {
        contentType: 'technical',
        tags: ['machine-learning', 'distributed-systems', 'consensus'],
        readingLevel: 'intermediate',
      },
      bibliographic: {
        publisher: 'Systems Engineering Press',
        publication_year: 2026,
        isbn: '978-0-13-400001-8',
        edition: '1st edition',
        authors: ['Elena Vance', 'Marcus Brody', 'Dr. Sarah Jenkins'],
        language: 'en',
        fell_back: false,
      },
    }),
    created_at: now,
    updated_at: now,
  });

  const fbSourceData = [
    { num: 1, title: 'Consensus Foundations and Safety Guarantees', p1: 'Distributed consensus protocols guarantee deterministic state transitions across asynchronous nodes prone to message delays and network partitions. By enforcing strict majority acknowledgment before committing any log entry, these protocols ensure that all replicas converge to an identical linearized history of operations, even in the presence of transient hardware failures, packet drops, and network partitions. The correctness proof relies on the intersection property of quorums, guaranteeing that any two quorums share at least one member that can detect conflicting proposals.', p2: 'Safety properties dictate that uncommitted operations never become visible to external client applications without majority quorum validation. Durability guarantees require that every committed entry survives arbitrary single-node crashes by being stored on a quorum of persistent replicas before acknowledging success to the caller. Liveness guarantees are intentionally weaker, permitting indefinite blocking during asymmetric partitions in exchange for absolute consistency, in accordance with the CAP theorem trade-offs faced by all distributed storage engines.' },
    { num: 2, title: 'Paxos and Raft Protocol Mechanics', p1: 'Leader election in Raft relies on randomized election timeouts to prevent split votes and establish authoritative log sequences. When a follower does not receive a heartbeat within its randomized timeout window, it increments its current term, transitions to the candidate state, and broadcasts RequestVote RPCs to all peers. A candidate requires acknowledgment from a strict majority of cluster members before declaring itself leader, ensuring at most one leader per term across all network partitions.', p2: 'Two-phase commit combined with replicated logs ensures serializable transaction ordering across physically distributed server clusters. In the prepare phase, the leader broadcasts proposed log entries to followers, who persist the entry durably and respond with acceptance before any commit message is issued. During the commit phase, the leader appends the commit record and advances the commit index, instructing all followers to apply the entry to their state machines in lock-step with the global transaction sequence.' },
    { num: 3, title: 'Distributed Sharding and Partitioning', p1: 'Consistent hashing with virtual nodes provides uniform key distribution and minimizes data movement when cluster topology changes dynamically. Each physical server is assigned multiple virtual node positions around a conceptual hash ring, so that adding or removing a server only displaces the fraction of keys adjacent to those positions rather than requiring a full redistribution. Load balancing is further refined by weighting virtual node counts proportionally to each server\'s available storage capacity and processing throughput.', p2: 'Cross-shard transactions utilize atomic commit protocols to maintain referential integrity without incurring excessive network round-trip overhead. A distributed transaction coordinator broadcasts prepare messages to all involved shard leaders, collecting votes before issuing a single commit or abort decision visible to all participants. Optimistic concurrency control combined with client-side read-your-writes caching reduces the frequency of cross-shard coordination, allowing the majority of single-key operations to execute with zero additional latency compared to local reads.' },
    { num: 4, title: 'Causal Consistency and Vector Clocks', p1: 'Vector clocks capture causal dependency relationships between concurrent updates in decentralized database replicas without central clock synchronization. Each replica maintains a vector indexed by node identifier, incrementing its own component on every local write and merging received vectors point-wise during inter-replica message delivery. A write is considered causally prior to another if and only if every component of its vector clock is less than or equal to the corresponding component of the later write\'s clock, enabling correct causal ordering without any central authority.', p2: 'Resolving concurrent conflict writes requires deterministic application-level merge functions or last-write-wins timestamps anchored by synchronized true-time hardware. Conflict-free replicated data types sidestep the need for merge logic by constraining operations to those that are commutative and associative, guaranteeing that all replicas converge to identical states regardless of message delivery order. In practice, e-commerce shopping carts and collaborative text editors leverage specialized CRDT variants to preserve user intent while eliminating coordination overhead across geographically distributed deployments.' },
    { num: 5, title: 'Byzantine Fault Tolerance and Quorums', p1: 'Byzantine fault tolerance protocols guarantee safety when up to one-third of participatory nodes exhibit arbitrary malicious behavior or silent corruption. The PBFT algorithm achieves this by executing a three-phase prepare-commit protocol that requires acknowledgments from two-thirds of all replicas, ensuring that any two quorum intersections share at least one honest node capable of detecting equivocating leaders. Modern variants such as HotStuff reduce communication complexity from quadratic to linear message complexity while preserving the same safety and liveness guarantees under asynchronous network conditions.', p2: 'Threshold cryptography and aggregate signature schemes reduce message complexity in large-scale consensus networks while maintaining cryptographic verifiability. By requiring that any subset of k nodes cooperate to produce a valid signature, threshold schemes prevent individual compromised nodes from unilaterally forging attestations while enabling compact proofs that replace n individual signatures with a single constant-size aggregate. Practical deployments in blockchain validator networks use BLS signature aggregation to reduce bandwidth consumption by orders of magnitude compared to naive multi-signature concatenation approaches.' },
    { num: 6, title: 'Stream Processing and Backpressure Dynamics', p1: 'Asynchronous stream processing architectures handle bursty message ingestion by employing adaptive reactive backpressure protocols throughout operator pipelines. When a downstream consumer signals saturation by refusing to acknowledge buffered messages, upstream producers throttle their emission rates proportionally to avoid unbounded memory growth and latency spikes. Credit-based flow control schemes extend this model by granting explicit token budgets to producers, allowing precise regulation of in-flight message counts and enabling fair sharing of pipeline capacity across competing data sources.', p2: 'Stateful stream operators persist incremental checkpoints to distributed blob storage to enable rapid failure recovery without reprocessing historical streams. Aligned barrier checkpointing coordinates snapshot boundaries across all operators in a topology, ensuring that the persisted state represents a globally consistent cut of the stream even in the presence of multiple concurrent sources. Upon recovery, operators restore their state from the most recent completed checkpoint and replay only the messages delivered after the barrier, dramatically reducing mean time to recovery for long-running analytics jobs.' }
  ];

  fbSourceData.forEach((src) => {
    const rawContent = `${src.p1}\n\n${src.p2}`;
    const blocks = [
      { type: 'heading', level: 1, text: src.title },
      { type: 'paragraph', text: src.p1 },
      { type: 'paragraph', text: src.p2 },
    ];
    insertChapter.run({
      id: `ch-fb-${src.num}`,
      book_id: bookBId,
      number: src.num,
      title: src.title,
      content: rawContent,
      canonical_content: JSON.stringify(blocks),
      word_count: rawContent.split(/\s+/).length,
      status: 'read',
      created_at: now,
      updated_at: now,
    });
    addChunk(bookBId, `ch-fb-${src.num}`, `chunk-fb-${src.num}-1`, (src.num - 1) * 2, `${src.title} Part A`, src.p1);
    addChunk(bookBId, `ch-fb-${src.num}`, `chunk-fb-${src.num}-2`, (src.num - 1) * 2 + 1, `${src.title} Part B`, src.p2);
  });

  const fbSmartPlan = [
    { seq: 1, title: 'Consensus Architectures in Modern Distributed Clusters', target: 220, chunks: ['chunk-fb-1-1', 'chunk-fb-1-2'] },
    { seq: 2, title: 'Leader Election and Replicated Log State Machines', target: 200, chunks: ['chunk-fb-2-1', 'chunk-fb-2-2'] },
    { seq: 3, title: 'Partitioning Topologies and Hash-Ring Sharding', target: 240, chunks: ['chunk-fb-3-1', 'chunk-fb-3-2'] },
    { seq: 4, title: 'Vector Clocks and Temporal Ordering in Partitioned Networks', target: 210, chunks: ['chunk-fb-4-1', 'chunk-fb-4-2'] },
    { seq: 5, title: 'Byzantine Fault Tolerance and Quorum Protocols', target: 230, chunks: ['chunk-fb-5-1', 'chunk-fb-5-2'] },
    { seq: 6, title: 'Asynchronous Stream Topologies and Adaptive Backpressure', target: 250, chunks: ['chunk-fb-6-1', 'chunk-fb-6-2'] },
    { seq: 7, title: 'Cross-Datacenter Replication and Geo-Distributed Latency', target: 240, chunks: ['chunk-fb-1-2', 'chunk-fb-4-1'] },
    { seq: 8, title: 'Autonomous Self-Healing in Heterogeneous Clusters', target: 260, chunks: ['chunk-fb-3-2', 'chunk-fb-5-1'] },
  ];

  insertOutline.run({
    outlineId: `book-editorial-${bookBId}`,
    collectionId: bookBId,
    title: 'Omni Reading: Practical Machine Learning and Distributed Systems',
    type: 'single_book',
    chapters: JSON.stringify(fbSmartPlan.map((p) => ({
      id: `smart-${bookBId}-ch-${p.seq}`,
      chapterId: `smart-${bookBId}-ch-${p.seq}`,
      sequence: p.seq,
      title: p.title,
      targetWordCount: p.target,
      sourceSectionIds: p.chunks,
    }))),
    createdAt: now,
  });

  const fbGenTexts = [
    `Distributed consensus architectures form the immutable backbone of contemporary transactional storage systems. By guaranteeing deterministic state machine transitions across geographically scattered compute instances, consensus engines shield applications from transient network disconnects and packet degradation.\n\nQuorum validation requires that every state transition receives cryptographic sign-off from a strict numerical majority of participants before mutation logs are flushed to persistent media. This rigorous barrier eliminates split-brain split-execution anomalies across arbitrary data partitions.\n\nModern distributed environments prioritize linearizable safety over raw throughput during network anomalies. When node membership fluctuates, consensus protocols dynamically renegotiate quorum configurations without compromising inflight client operations.`,

    `Leader election protocols such as Raft enforce deterministic log ordering by establishing single-leader authority within defined temporal epochs. Randomized heartbeats and election timers prevent split-vote deadlocks, ensuring rapid automated failover when primary nodes become unreachable.\n\nReplicated write-ahead logs guarantee that all follower replicas execute identical state updates in identical chronological sequences. Once committed by the cluster leader, log entries cannot be overwritten or discarded by subsequent leader terms.\n\nBy unifying term leadership and log synchronization, contemporary algorithms drastically simplify formal correctness verification while delivering enterprise-grade transactional resilience.`,

    `Dynamic partitioning strategies distribute massive tabular workloads across elastic storage nodes using consistent hashing algorithms. By mapping server instances onto a virtualized hash ring, cluster reorganizations require migrating only a tiny fraction of total partitioned key-ranges.\n\nTwo-phase atomic commit mechanisms guarantee transactional atomicity across multiple distinct storage shards. When distributed transactions span non-colocated partitions, transaction coordinators synchronize prepare and commit phases to prevent partial update anomalies.\n\nOptimized partition routing reduces unnecessary cross-datacenter round-trips, empowering analytical databases to sustain high-throughput ingestion rates while retaining full snapshot isolation guarantees.`,

    `Decentralized distributed replicas cannot rely on physical wall-clock timestamps for causal event ordering due to pervasive hardware clock drift. Vector clocks overcome this physical limit by tracking causal ancestor sets across independent distributed processes.\n\nWhen concurrent updates produce irreconcilable branch histories, application-specific deterministic merge routines resolve divergent state versions. In scenarios prioritizing eventual consistency, conflict-free replicated data types provide mathematical convergence guarantees.\n\nBy capturing logical causality rather than wall-clock time, decentralized networks maintain coherent global states under frequent partitions and unpredictable latency spikes.`,

    `Byzantine fault tolerance protocols ensure absolute cryptographic integrity even when hostile nodes transmit conflicting instructions to different peers. By demanding a two-thirds supermajority consensus threshold, Byzantine networks neutralize coordinated malicious disruptions.\n\nThreshold signature schemes compress multi-party attestations into compact verifiable proofs, drastically reducing peer-to-peer network payload bandwidth requirements across thousands of validator nodes.\n\nHardware enclave verifications combined with zero-knowledge cryptographic primitives establish performant decentralized settlement layers that operate reliably over untrusted public network infrastructure.`
  ];

  [1, 2, 3, 4, 5].forEach((seq) => {
    const text = fbGenTexts[seq - 1];
    const words = text.trim().split(/\s+/).length;
    const isFallback = seq === 5;
    const plan = fbSmartPlan[seq - 1];

    insertSmartChapter.run({
      id: `smart-${bookBId}-ch-${seq}`,
      book_id: bookBId,
      sequence: seq,
      title: plan.title,
      status: 'generated',
      planned_source_section_ids: JSON.stringify(plan.chunks),
      planned_word_count: plan.target,
      content: text,
      synthesis_type: 'single_book',
      metadata_json: JSON.stringify({
        outlineId: `book-editorial-${bookBId}`,
        chapterId: `smart-${bookBId}-ch-${seq}`,
        title: plan.title,
        grounded: true,
        chunkCount: plan.chunks.length,
        provenance: plan.chunks,
        canonicalBlocks: text.split('\n\n').map((p) => ({ type: 'paragraph', text: p })),
        provider: 'deterministic_synthesizer',
        model: 'smart_reader_v4',
        generatedAt: now,
        actual_word_count: words,
        source_word_count: words * 7,
        ...(isFallback ? { fell_back: true, fallback_reason: 'provider_unavailable' } : {}),
      }),
      created_at: now,
      updated_at: now,
    });
  });

  // Paragraph attributions covering c_primary, c_verified_by_a, b_arbitrated, ungrounded
  // Ch 1: c_primary
  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fb-1-${pIdx}`,
      smart_chapter_id: `smart-${bookBId}-ch-1`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: 'chunk-fb-1-1', confidence: 0.95 }]),
      source_chunk_ids: JSON.stringify(['chunk-fb-1-1']),
      weights_json: JSON.stringify({ 'chunk-fb-1-1': 1.0 }),
      method: 'c_primary',
      confidence: 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  // Ch 2: c_verified_by_a
  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fb-2-${pIdx}`,
      smart_chapter_id: `smart-${bookBId}-ch-2`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: 'chunk-fb-2-1', confidence: 0.78 }]),
      source_chunk_ids: JSON.stringify(['chunk-fb-2-1']),
      weights_json: JSON.stringify({ 'chunk-fb-2-1': 1.0 }),
      method: pIdx === 0 ? 'c_verified_by_a' : 'c_primary',
      confidence: pIdx === 0 ? 'medium' : 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  // Ch 3: b_arbitrated
  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fb-3-${pIdx}`,
      smart_chapter_id: `smart-${bookBId}-ch-3`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: 'chunk-fb-3-1', confidence: 0.72 }]),
      source_chunk_ids: JSON.stringify(['chunk-fb-3-1']),
      weights_json: JSON.stringify({ 'chunk-fb-3-1': 1.0 }),
      method: pIdx === 0 ? 'b_arbitrated' : 'c_primary',
      confidence: pIdx === 0 ? 'medium' : 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  // Ch 4: ungrounded on paragraph 2
  [0, 1, 2].forEach((pIdx) => {
    const isUngrounded = pIdx === 2;
    insertAttribution.run({
      id: `attr-fb-4-${pIdx}`,
      smart_chapter_id: `smart-${bookBId}-ch-4`,
      paragraph_index: pIdx,
      segments_json: isUngrounded ? '[]' : JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: 'chunk-fb-4-1', confidence: 0.88 }]),
      source_chunk_ids: isUngrounded ? '[]' : JSON.stringify(['chunk-fb-4-1']),
      weights_json: isUngrounded ? '{}' : JSON.stringify({ 'chunk-fb-4-1': 1.0 }),
      method: isUngrounded ? 'ungrounded' : 'c_primary',
      confidence: isUngrounded ? 'none' : 'high',
      grounded: isUngrounded ? 0 : 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  // Ch 5: fell_back
  [0, 1, 2].forEach((pIdx) => {
    insertAttribution.run({
      id: `attr-fb-5-${pIdx}`,
      smart_chapter_id: `smart-${bookBId}-ch-5`,
      paragraph_index: pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: 'chunk-fb-5-1', confidence: 0.85 }]),
      source_chunk_ids: JSON.stringify(['chunk-fb-5-1']),
      weights_json: JSON.stringify({ 'chunk-fb-5-1': 1.0 }),
      method: 'c_primary',
      confidence: 'high',
      grounded: 1,
      verified_at: now,
      fell_back: 1,
      fallback_reason: 'provider_unavailable',
    });
  });

  // Pending and failed chapters for Fixture B
  insertSmartChapter.run({
    id: `smart-${bookBId}-ch-6`,
    book_id: bookBId,
    sequence: 6,
    title: fbSmartPlan[5].title,
    status: 'pending',
    planned_source_section_ids: JSON.stringify(fbSmartPlan[5].chunks),
    planned_word_count: fbSmartPlan[5].target,
    content: null,
    synthesis_type: 'single_book',
    metadata_json: null,
    created_at: now,
    updated_at: now,
  });

  insertSmartChapter.run({
    id: `smart-${bookBId}-ch-7`,
    book_id: bookBId,
    sequence: 7,
    title: fbSmartPlan[6].title,
    status: 'pending',
    planned_source_section_ids: JSON.stringify(fbSmartPlan[6].chunks),
    planned_word_count: fbSmartPlan[6].target,
    content: null,
    synthesis_type: 'single_book',
    metadata_json: null,
    created_at: now,
    updated_at: now,
  });

  insertSmartChapter.run({
    id: `smart-${bookBId}-ch-8`,
    book_id: bookBId,
    sequence: 8,
    title: fbSmartPlan[7].title,
    status: 'failed',
    planned_source_section_ids: JSON.stringify(fbSmartPlan[7].chunks),
    planned_word_count: fbSmartPlan[7].target,
    content: null,
    synthesis_type: 'single_book',
    metadata_json: JSON.stringify({ error: 'LLM rate limit exceeded during synthesis' }),
    created_at: now,
    updated_at: now,
  });

  // =========================================================================
  // FIXTURE S — Supporting Source Book (book-fixture-s)
  // Provides 3rd source book for multi-source dossier chunk citations
  // =========================================================================
  const bookSId = 'book-fixture-s';
  insertBook.run({
    id: bookSId,
    title: 'Cognitive Architectures and Semantic Memory',
    author: 'Dr. Clara Sterling',
    description: 'Theoretical principles of semantic memory networks, episodic indexing, and cognitive representations.',
    cover_path: 'covers/default-cognitive.png',
    content_type: 'paper',
    status: 'active',
    original_filename: 'cognitive_memory.txt',
    source_site: 'Cognitive Science Quarterly',
    source_url: 'https://example.org/cognitive-memory',
    section_count: 2,
    integrity_status: 'valid',
    semantic_status: 'indexed',
    semantic_chunk_count: 4,
    semantic_indexed_at: now,
    metadata_json: JSON.stringify({
      classification: {
        contentType: 'paper',
        tags: ['cognitive-science', 'memory-networks'],
        readingLevel: 'research',
      },
      bibliographic: {
        publisher: 'Cognitive Science Quarterly',
        publication_year: 2025,
        authors: ['Dr. Clara Sterling'],
        language: 'en',
        fell_back: false,
      },
    }),
    created_at: now,
    updated_at: now,
  });

  const fsCh1Text = `Semantic memory networks structure categorical knowledge through hierarchical spreading activation across associative concepts. Retrieval latency correlates directly with semantic graph distance between retrieval cues and target nodes.`;
  insertChapter.run({
    id: 'ch-fs-1',
    book_id: bookSId,
    number: 1,
    title: 'Hierarchical Categorical Memory',
    content: fsCh1Text,
    canonical_content: JSON.stringify([
      { type: 'heading', level: 1, text: 'Hierarchical Categorical Memory' },
      { type: 'paragraph', text: fsCh1Text }
    ]),
    word_count: fsCh1Text.split(/\s+/).length,
    status: 'read',
    created_at: now,
    updated_at: now,
  });
  addChunk(bookSId, 'ch-fs-1', 'chunk-fs-1-1', 0, 'Spreading Activation Networks', fsCh1Text);
  addChunk(bookSId, 'ch-fs-1', 'chunk-fs-1-2', 1, 'Associative Retrieval Dynamics', 'Retrieval latency correlates directly with semantic graph distance between retrieval cues and target nodes.');

  const fsCh2Text = `Episodic memory indexing maps temporal experiences into contextual spatial coordinates, allowing rapid recollection of sequential event streams.`;
  insertChapter.run({
    id: 'ch-fs-2',
    book_id: bookSId,
    number: 2,
    title: 'Episodic Context Coordinates',
    content: fsCh2Text,
    canonical_content: JSON.stringify([
      { type: 'heading', level: 1, text: 'Episodic Context Coordinates' },
      { type: 'paragraph', text: fsCh2Text }
    ]),
    word_count: fsCh2Text.split(/\s+/).length,
    status: 'read',
    created_at: now,
    updated_at: now,
  });
  addChunk(bookSId, 'ch-fs-2', 'chunk-fs-2-1', 0, 'Temporal Context Mapping', fsCh2Text);
  addChunk(bookSId, 'ch-fs-2', 'chunk-fs-2-2', 1, 'Sequential Recollection Streams', 'Sequential recollection streams enable continuous episodic reconstruction over long horizons.');

  // =========================================================================
  // FIXTURE C — Multi-Source Dossier (dossier-fixture-c)
  // 4 smart_chapters, planned_source_section_ids pointing at chunks from 3 fixture books
  // =========================================================================
  const dossierCId = 'dossier-fixture-c';
  insertBook.run({
    id: dossierCId,
    title: 'Comparative Synthesis: Adaptive Systems',
    author: 'Multi-Source Editorial Board',
    description: 'Synthesized research collection comparing biological neural state spaces with distributed algorithmic consensus.',
    cover_path: 'covers/default-dossier.png',
    content_type: 'reference',
    status: 'active',
    original_filename: 'adaptive_systems_dossier.json',
    source_site: 'Multi-Source Dossier',
    source_url: '',
    section_count: 0,
    integrity_status: 'valid',
    semantic_status: 'indexed',
    semantic_chunk_count: 0,
    semantic_indexed_at: now,
    metadata_json: JSON.stringify({
      classification: {
        contentType: 'reference',
        tags: ['comparative-systems', 'adaptive-networks'],
        readingLevel: 'advanced',
      },
      bibliographic: {
        publisher: 'Multi-Source Dossier',
        publication_year: 2026,
        authors: ['Multi-Source Editorial Board'],
        language: 'en',
        fell_back: false,
      },
    }),
    created_at: now,
    updated_at: now,
  });

  const dossierPlan = [
    { seq: 1, title: 'Comparative State Convergence: Manifolds and Quorums', chunks: ['chunk-fa-1-1', 'chunk-fb-1-1', 'chunk-fs-1-1'], target: 220 },
    { seq: 2, title: 'Temporal Ordering and Energy Conservation Across Domains', chunks: ['chunk-fa-2-1', 'chunk-fb-4-1', 'chunk-fs-2-1'], target: 220 },
    { seq: 3, title: 'Decentralized Fault Handling in Biological and Artificial Networks', chunks: ['chunk-fa-1-2', 'chunk-fb-3-1', 'chunk-fs-1-2'], target: 230 },
    { seq: 4, title: 'Adaptive Homeostasis and Protocol Resiliency', chunks: ['chunk-fa-2-2', 'chunk-fb-6-1', 'chunk-fs-2-2'], target: 240 },
  ];

  insertOutline.run({
    outlineId: `dossier-editorial-${dossierCId}`,
    collectionId: dossierCId,
    title: 'Multi-Source Synthesis: Adaptive & Distributed Architectures',
    type: 'multi_source',
    chapters: JSON.stringify(dossierPlan.map((p) => ({
      id: `smart-${dossierCId}-ch-${p.seq}`,
      chapterId: `smart-${dossierCId}-ch-${p.seq}`,
      sequence: p.seq,
      title: p.title,
      targetWordCount: p.target,
      sourceSectionIds: p.chunks,
    }))),
    createdAt: now,
  });

  const dossierCh1Text = `Biological neural manifolds and distributed consensus protocols converge upon identical mathematical principles when stabilizing state transitions under asynchronous noise. While continuous attractor networks utilize symmetric synaptic feedback to suppress thermal drift, distributed computing clusters employ majority quorums to eliminate split-brain anomalies.\n\nCognitive spreading activation networks mirror distributed hash-ring routing by directing associative retrieval flows along shortest graph geodesics. Both paradigms balance local autonomy against global coherence without relying on centralized bottlenecks.\n\nBy cross-referencing neural energy landscapes with distributed state machine logs, unified architectural frameworks emerge that simultaneously optimize memory retention, latency bounds, and fault tolerance.`;
  const dossierCh1Words = dossierCh1Text.trim().split(/\s+/).length;

  insertSmartChapter.run({
    id: `smart-${dossierCId}-ch-1`,
    book_id: dossierCId,
    sequence: 1,
    title: dossierPlan[0].title,
    status: 'generated',
    planned_source_section_ids: JSON.stringify(dossierPlan[0].chunks),
    planned_word_count: dossierPlan[0].target,
    content: dossierCh1Text,
    synthesis_type: 'multi_source',
    metadata_json: JSON.stringify({
      outlineId: `dossier-editorial-${dossierCId}`,
      chapterId: `smart-${dossierCId}-ch-1`,
      title: dossierPlan[0].title,
      grounded: true,
      chunkCount: 3,
      provenance: dossierPlan[0].chunks,
      canonicalBlocks: dossierCh1Text.split('\n\n').map((p) => ({ type: 'paragraph', text: p })),
      provider: 'deterministic_synthesizer',
      model: 'smart_reader_v4',
      generatedAt: now,
      actual_word_count: dossierCh1Words,
      source_word_count: dossierCh1Words * 7,
    }),
    created_at: now,
    updated_at: now,
  });

  // Cross-source attributions referencing chunks from 3 different books
  [
    { pIdx: 0, chunk: 'chunk-fa-1-1', method: 'c_primary', conf: 'high' },
    { pIdx: 1, chunk: 'chunk-fb-1-1', method: 'c_verified_by_a', conf: 'medium' },
    { pIdx: 2, chunk: 'chunk-fs-1-1', method: 'c_primary', conf: 'high' },
  ].forEach((attr) => {
    insertAttribution.run({
      id: `attr-dossier-1-${attr.pIdx}`,
      smart_chapter_id: `smart-${dossierCId}-ch-1`,
      paragraph_index: attr.pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: attr.chunk, confidence: 0.89 }]),
      source_chunk_ids: JSON.stringify([attr.chunk]),
      weights_json: JSON.stringify({ [attr.chunk]: 1.0 }),
      method: attr.method,
      confidence: attr.conf,
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  const dossierCh2Text = `Temporal ordering across decentralized systems reveals deep mathematical analogies between vector clock causal sets and multidimensional Lyapunov gradient surfaces. In biological networks, neuromodulatory tone shifts operating regimes smoothly between stable point attractors and oscillatory limit cycles.\n\nSimilarly, distributed algorithms reconcile concurrent write conflicts through deterministic application merges, preventing split-brain divergence without central clock synchronization.\n\nSynthesizing episodic spatial coordinates with distributed consensus mechanics demonstrates that robust fault tolerance requires tracking relative historical causality rather than absolute temporal coordinates.`;
  const dossierCh2Words = dossierCh2Text.trim().split(/\s+/).length;

  insertSmartChapter.run({
    id: `smart-${dossierCId}-ch-2`,
    book_id: dossierCId,
    sequence: 2,
    title: dossierPlan[1].title,
    status: 'generated',
    planned_source_section_ids: JSON.stringify(dossierPlan[1].chunks),
    planned_word_count: dossierPlan[1].target,
    content: dossierCh2Text,
    synthesis_type: 'multi_source',
    metadata_json: JSON.stringify({
      outlineId: `dossier-editorial-${dossierCId}`,
      chapterId: `smart-${dossierCId}-ch-2`,
      title: dossierPlan[1].title,
      grounded: true,
      chunkCount: 3,
      provenance: dossierPlan[1].chunks,
      canonicalBlocks: dossierCh2Text.split('\n\n').map((p) => ({ type: 'paragraph', text: p })),
      provider: 'deterministic_synthesizer',
      model: 'smart_reader_v4',
      generatedAt: now,
      actual_word_count: dossierCh2Words,
      source_word_count: dossierCh2Words * 7,
    }),
    created_at: now,
    updated_at: now,
  });

  [
    { pIdx: 0, chunk: 'chunk-fa-2-1', method: 'c_primary', conf: 'high' },
    { pIdx: 1, chunk: 'chunk-fb-4-1', method: 'b_arbitrated', conf: 'medium' },
    { pIdx: 2, chunk: 'chunk-fs-2-1', method: 'c_primary', conf: 'high' },
  ].forEach((attr) => {
    insertAttribution.run({
      id: `attr-dossier-2-${attr.pIdx}`,
      smart_chapter_id: `smart-${dossierCId}-ch-2`,
      paragraph_index: attr.pIdx,
      segments_json: JSON.stringify([{ sentence_start: 0, sentence_end: 1, chunk_id: attr.chunk, confidence: 0.85 }]),
      source_chunk_ids: JSON.stringify([attr.chunk]),
      weights_json: JSON.stringify({ [attr.chunk]: 1.0 }),
      method: attr.method,
      confidence: attr.conf,
      grounded: 1,
      verified_at: now,
      fell_back: 0,
      fallback_reason: null,
    });
  });

  insertSmartChapter.run({
    id: `smart-${dossierCId}-ch-3`,
    book_id: dossierCId,
    sequence: 3,
    title: dossierPlan[2].title,
    status: 'pending',
    planned_source_section_ids: JSON.stringify(dossierPlan[2].chunks),
    planned_word_count: dossierPlan[2].target,
    content: null,
    synthesis_type: 'multi_source',
    metadata_json: null,
    created_at: now,
    updated_at: now,
  });

  insertSmartChapter.run({
    id: `smart-${dossierCId}-ch-4`,
    book_id: dossierCId,
    sequence: 4,
    title: dossierPlan[3].title,
    status: 'pending',
    planned_source_section_ids: JSON.stringify(dossierPlan[3].chunks),
    planned_word_count: dossierPlan[3].target,
    content: null,
    synthesis_type: 'multi_source',
    metadata_json: null,
    created_at: now,
    updated_at: now,
  });

  // Seed sample summary representation for chapter_representations table (which survives for SUMMARY / BOOK_SUMMARY)
  insertSummaryRep.run({
    id: 'rep-sample-summary-fa-1',
    chapter_id: 'ch-fa-1',
    book_id: bookAId,
    type: 'SUMMARY',
    content: '• Key Milestones:\n1. Linear attractor networks preserve continuous variables in neural state space.\n2. Excitation and inhibition balance prevents signal drift under thermal noise.',
    metadata_json: JSON.stringify({ model: 'smart_reader_v4', provider: 'deterministic_synthesizer' }),
    created_at: now,
  });
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

