/**
 * Build 4.19 Pre-Hydration Contract Test
 *
 * Validates data shape before frontend hydration:
 * 1. Books: required fields, non-empty IDs/titles, content_type format, chapterCount >= 0
 * 2. Chapters: non-empty IDs, referential integrity to books table, valid numbers and titles, word_count >= 0
 * 3. EDITORIAL_SYNTHESIS Representations:
 *    - All 12 required metadata_json fields with expected types
 *    - canonicalBlocks matching the exact 8-type union from frontend/src/types/domain.ts
 *    - Non-empty provenance arrays
 *    - No forbidden literals ('undefined', 'NaN', '[object Object]', 'null') in block string fields
 * 4. Generates tmp/contract-report.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db/database');

const CANONICAL_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'list',
  'code',
  'separator',
  'callout',
  'table',
]);

const KNOWN_CONTENT_TYPES = new Set([
  'novel',
  'textbook',
  'essay',
  'paper',
  'reference',
  'memo',
  'article',
  'other',
]);

const FORBIDDEN_LITERALS = ['undefined', 'NaN', '[object Object]', 'null'];

async function runContractTest() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.19: PRE-HYDRATION CONTRACT TEST');
  console.log('================================================================\n');

  const db = getDatabase();
  const rootDir = path.resolve(__dirname, '..', '..');
  const reportPath = path.join(rootDir, 'tmp', 'contract-report.json');

  const issues = [];
  const warnings = [];

  // --------------------------------------------------------------------------
  // 1. Books contract
  // --------------------------------------------------------------------------
  console.log('[1/3] Validating Books schema contract...');
  const books = db
    .prepare(`
      SELECT b.*,
        (SELECT COUNT(1) FROM chapters c WHERE c.book_id = b.id) as chapter_count
      FROM books b
      ORDER BY b.created_at ASC
    `)
    .all();

  const bookIdSet = new Set(books.map((b) => b.id));

  for (const book of books) {
    if (typeof book.id !== 'string' || !book.id.trim()) {
      issues.push({ category: 'book', id: book.id || 'unknown', message: 'Book id must be a non-empty string' });
    }
    if (typeof book.title !== 'string' || !book.title.trim()) {
      issues.push({ category: 'book', id: book.id, message: 'Book title must be a non-empty string' });
    }
    if (typeof book.content_type !== 'string' || !book.content_type.trim()) {
      issues.push({ category: 'book', id: book.id, message: 'Book content_type must be a non-empty string' });
    } else if (!KNOWN_CONTENT_TYPES.has(book.content_type.toLowerCase())) {
      warnings.push({
        category: 'book',
        id: book.id,
        message: `Non-standard content_type: "${book.content_type}" (expected one of ${Array.from(KNOWN_CONTENT_TYPES).join(', ')})`,
      });
    }
    const chapterCount = book.chapter_count;
    if (typeof chapterCount !== 'number' || chapterCount < 0) {
      issues.push({ category: 'book', id: book.id, message: `Book chapterCount must be a number >= 0, got ${chapterCount}` });
    }
  }
  console.log(`  ✓ Checked ${books.length} book(s).`);

  // --------------------------------------------------------------------------
  // 2. Chapters contract
  // --------------------------------------------------------------------------
  console.log('[2/3] Validating Chapters schema contract & referential integrity...');
  const chapters = db.prepare('SELECT * FROM chapters ORDER BY book_id, number ASC').all();

  for (const ch of chapters) {
    if (typeof ch.id !== 'string' || !ch.id.trim()) {
      issues.push({ category: 'chapter', id: ch.id || 'unknown', message: 'Chapter id must be a non-empty string' });
    }
    if (!bookIdSet.has(ch.book_id)) {
      issues.push({ category: 'chapter', id: ch.id, message: `Referential integrity failed: chapter book_id "${ch.book_id}" not found in books` });
    }
    if (typeof ch.number !== 'number') {
      issues.push({ category: 'chapter', id: ch.id, message: `Chapter number must be a number, got ${typeof ch.number}` });
    }
    if (typeof ch.title !== 'string') {
      issues.push({ category: 'chapter', id: ch.id, message: `Chapter title must be a string, got ${typeof ch.title}` });
    }
    if (typeof ch.word_count !== 'number' || ch.word_count < 0) {
      issues.push({ category: 'chapter', id: ch.id, message: `Chapter word_count must be a number >= 0, got ${ch.word_count}` });
    }
  }
  console.log(`  ✓ Checked ${chapters.length} chapter(s).`);

  // --------------------------------------------------------------------------
  // 3. EDITORIAL_SYNTHESIS Representations contract
  // --------------------------------------------------------------------------
  console.log('[3/3] Validating EDITORIAL_SYNTHESIS Representations contract...');
  const reps = db
    .prepare("SELECT * FROM chapter_representations WHERE type = 'EDITORIAL_SYNTHESIS' ORDER BY created_at ASC")
    .all();

  if (reps.length === 0) {
    console.log('  [Notice] No EDITORIAL_SYNTHESIS representations found in DB.');
    console.log('  [Skip] Skipping representation checks cleanly (requires prior synthesis run).\n');
    const report = {
      counts: { books: books.length, chapters: chapters.length, representations: 0 },
      issues,
      warnings,
      pass: issues.length === 0,
      skipped: true,
      reason: 'no_representations_in_db',
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    if (issues.length > 0) {
      console.error(`\n❌ Found ${issues.length} contract issue(s) on books/chapters:`);
      issues.forEach((iss, i) => console.error(`  ${i + 1}. [${iss.category}:${iss.id}] ${iss.message}`));
      assert.fail(`Pre-hydration contract test failed with ${issues.length} issue(s).`);
    }

    console.log('================================================================');
    console.log('🎉 PRE-HYDRATION CONTRACT TEST PASSED (SKIPPED REPS)');
    console.log('================================================================\n');
    return;
  }

  function scanStringsForForbidden(val, pathStr, repId) {
    if (typeof val === 'string') {
      for (const forbidden of FORBIDDEN_LITERALS) {
        if (val.includes(forbidden)) {
          issues.push({
            category: 'representation',
            id: repId,
            message: `Forbidden literal "${forbidden}" found at ${pathStr} in canonicalBlock: "${val.slice(0, 60)}"`,
          });
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => scanStringsForForbidden(item, `${pathStr}[${idx}]`, repId));
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        scanStringsForForbidden(v, `${pathStr}.${k}`, repId);
      }
    }
  }

  for (const rep of reps) {
    if (typeof rep.id !== 'string' || !rep.id.trim()) {
      issues.push({ category: 'representation', id: rep.id || 'unknown', message: 'Representation id must be a non-empty string' });
    }
    if (typeof rep.book_id !== 'string' || !rep.book_id.trim()) {
      issues.push({ category: 'representation', id: rep.id, message: 'Representation book_id must be a non-empty string' });
    }
    if (typeof rep.content !== 'string' || !rep.content.trim()) {
      issues.push({ category: 'representation', id: rep.id, message: 'Representation content must be a non-empty string' });
    }

    let meta = null;
    try {
      meta = typeof rep.metadata_json === 'string' ? JSON.parse(rep.metadata_json) : rep.metadata_json;
    } catch (err) {
      issues.push({ category: 'representation', id: rep.id, message: `Failed to parse metadata_json: ${err.message}` });
    }

    if (meta && typeof meta === 'object') {
      const requiredFields = [
        { key: 'outlineId', type: 'string' },
        { key: 'chapterId', type: 'string' },
        { key: 'title', type: 'string' },
        { key: 'grounded', type: 'boolean' },
        { key: 'chunkCount', type: 'number' },
        { key: 'provenance', type: 'array' },
        { key: 'canonicalBlocks', type: 'array' },
        { key: 'provider', type: 'string' },
        { key: 'model', type: 'string' },
        { key: 'generatedAt', type: 'string' },
        { key: 'actual_word_count', type: 'number' },
        { key: 'source_word_count', type: 'number' },
      ];

      for (const req of requiredFields) {
        const val = meta[req.key];
        if (val === undefined || val === null) {
          issues.push({ category: 'representation', id: rep.id, message: `Missing required metadata field: "${req.key}"` });
        } else if (req.type === 'array') {
          if (!Array.isArray(val)) {
            issues.push({ category: 'representation', id: rep.id, message: `Metadata field "${req.key}" must be an array` });
          }
        } else if (typeof val !== req.type) {
          issues.push({ category: 'representation', id: rep.id, message: `Metadata field "${req.key}" must be of type ${req.type}, got ${typeof val}` });
        }
      }

      // Check provenance contents
      if (Array.isArray(meta.provenance)) {
        if (meta.provenance.length === 0) {
          issues.push({ category: 'representation', id: rep.id, message: 'Provenance must be a non-empty array' });
        }
        for (const p of meta.provenance) {
          if (typeof p !== 'string' || !p.trim()) {
            issues.push({ category: 'representation', id: rep.id, message: `Provenance items must be non-empty strings, got ${typeof p}` });
            break;
          }
        }
      }

      // Check canonicalBlocks contents & structure
      if (Array.isArray(meta.canonicalBlocks)) {
        if (meta.canonicalBlocks.length === 0) {
          issues.push({ category: 'representation', id: rep.id, message: 'canonicalBlocks must be a non-empty array' });
        }
        for (let bIdx = 0; bIdx < meta.canonicalBlocks.length; bIdx++) {
          const block = meta.canonicalBlocks[bIdx];
          if (!block || typeof block !== 'object') {
            issues.push({ category: 'representation', id: rep.id, message: `canonicalBlocks[${bIdx}] must be an object` });
            continue;
          }
          if (!CANONICAL_BLOCK_TYPES.has(block.type)) {
            issues.push({
              category: 'representation',
              id: rep.id,
              message: `canonicalBlocks[${bIdx}] has invalid type "${block.type}" (allowed: ${Array.from(CANONICAL_BLOCK_TYPES).join(', ')})`,
            });
          }
          scanStringsForForbidden(block, `canonicalBlocks[${bIdx}]`, rep.id);
        }
      }
    }
  }
  console.log(`  ✓ Checked ${reps.length} EDITORIAL_SYNTHESIS representation(s).`);

  // --------------------------------------------------------------------------
  // 4. Report & Aggregate status
  // --------------------------------------------------------------------------
  const pass = issues.length === 0;
  const report = {
    counts: {
      books: books.length,
      chapters: chapters.length,
      representations: reps.length,
    },
    issues,
    warnings,
    pass,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[Report] Contract evaluation written to ${reportPath}`);
  console.log('[Report Summary]:', JSON.stringify({ counts: report.counts, issuesCount: issues.length, warningsCount: warnings.length, pass }, null, 2));

  if (warnings.length > 0) {
    console.warn(`\n⚠️  ${warnings.length} warning(s):`);
    warnings.forEach((w, i) => console.warn(`  ${i + 1}. [${w.category}:${w.id}] ${w.message}`));
  }

  if (issues.length > 0) {
    console.error(`\n❌ Found ${issues.length} contract issue(s):`);
    issues.forEach((iss, i) => console.error(`  ${i + 1}. [${iss.category}:${iss.id}] ${iss.message}`));
    assert.fail(`Pre-hydration contract test failed with ${issues.length} issue(s). See tmp/contract-report.json`);
  }

  console.log('\n================================================================');
  console.log('🎉 PRE-HYDRATION CONTRACT TEST PASSED (0 ISSUES)');
  console.log('================================================================\n');
}

runContractTest()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch((err) => {
    console.error('\n❌ PRE-HYDRATION CONTRACT TEST FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });

