#!/usr/bin/env node
/**
 * scripts/diagnose-synthesis.js
 *
 * Read-only diagnostic script that inspects SQLite database for the most recent
 * book with synthesized Smart Chapters and prints/saves full chapter text,
 * provenance snippets, and synthesis summary statistics.
 *
 * Usage:
 *   node scripts/diagnose-synthesis.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../backend/config');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = config.DB_PATH || path.join(ROOT_DIR, 'storage', 'data.db');

function run() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[diagnose-synthesis] Database file not found at: ${DB_PATH}`);
    console.error('[diagnose-synthesis] No synthesized chapters found in DB. Import a book first.');
    process.exit(1);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.error(`[diagnose-synthesis] Failed to open database read-only: ${err.message}`);
    process.exit(1);
  }

  // Verify required tables exist
  const requiredTables = ['chapter_representations', 'semantic_chunks', 'books'];
  for (const tbl of requiredTables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
    if (!exists) {
      console.error(`[diagnose-synthesis] Required table '${tbl}' does not exist in database.`);
      process.exit(1);
    }
  }

  // 1. Find the most recent book_id that has synthesized chapters
  const latestRow = db.prepare(`
    SELECT book_id, MAX(created_at) as latest_created
    FROM chapter_representations
    WHERE type = 'EDITORIAL_SYNTHESIS' OR synthesisType IN ('single_book', 'cross_source')
    GROUP BY book_id
    ORDER BY latest_created DESC
    LIMIT 1
  `).get();

  if (!latestRow || !latestRow.book_id) {
    console.error('[diagnose-synthesis] No synthesized chapters found in DB. Import a book first.');
    process.exit(1);
  }

  const bookId = latestRow.book_id;

  // Retrieve book metadata
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
  const bookTitle = book ? book.title : 'Unknown Book';

  // Check for editorial outline to maintain canonical chapter order
  let outlineChapters = [];
  try {
    const hasOutlinesTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='editorial_outlines'").get();
    if (hasOutlinesTable) {
      const outlineRow = db.prepare(`
        SELECT * FROM editorial_outlines
        WHERE collectionId = ? OR outlineId = ?
        ORDER BY createdAt DESC
        LIMIT 1
      `).get(bookId, `book-editorial-${bookId}`);

      if (outlineRow && outlineRow.chapters) {
        outlineChapters = JSON.parse(outlineRow.chapters);
      }
    }
  } catch (err) {
    console.warn(`[diagnose-synthesis] Note: could not load outline order: ${err.message}`);
  }

  // Retrieve all synthesized chapter representations for this book
  const reps = db.prepare(`
    SELECT * FROM chapter_representations
    WHERE book_id = ? AND (type = 'EDITORIAL_SYNTHESIS' OR synthesisType IN ('single_book', 'cross_source'))
  `).all(bookId);

  if (!reps || reps.length === 0) {
    console.error('[diagnose-synthesis] No synthesized chapters found in DB. Import a book first.');
    process.exit(1);
  }

  // Order representations by outline if available, otherwise by created_at ASC
  let orderedEntries = [];
  if (Array.isArray(outlineChapters) && outlineChapters.length > 0) {
    const repByChapterId = new Map();
    for (const r of reps) {
      repByChapterId.set(r.chapter_id, r);
      repByChapterId.set(r.id, r);
    }

    const seenIds = new Set();
    for (const ch of outlineChapters) {
      const chId = ch.chapterId || ch.id;
      const match = repByChapterId.get(chId);
      if (match && !seenIds.has(match.id)) {
        orderedEntries.push({ rep: match, outlineChapter: ch });
        seenIds.add(match.id);
      }
    }

    // Append any reps not in outline
    for (const r of reps) {
      if (!seenIds.has(r.id)) {
        orderedEntries.push({ rep: r, outlineChapter: null });
        seenIds.add(r.id);
      }
    }
  } else {
    orderedEntries = reps
      .slice()
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .map((r) => ({ rep: r, outlineChapter: null }));
  }

  // Prepare chunk query statement
  const chunkStmt = db.prepare('SELECT id, text_content, section_heading, structural_role FROM semantic_chunks WHERE id = ?');

  const lines = [];
  function out(line = '') {
    lines.push(line);
  }

  out('================================================================================');
  out(`SYNTHESIZED SMART CHAPTERS REPORT`);
  out(`Generated: ${new Date().toISOString()}`);
  out(`Book ID:   ${bookId}`);
  out(`Title:     ${bookTitle}`);
  out(`Chapters:  ${orderedEntries.length} synthesized chapter(s)`);
  out('================================================================================\n');

  const chapterStats = [];

  for (let idx = 0; idx < orderedEntries.length; idx++) {
    const { rep, outlineChapter } = orderedEntries[idx];

    let metadata = {};
    try {
      metadata = rep.metadata_json ? JSON.parse(rep.metadata_json) : {};
    } catch (_) {
      metadata = {};
    }

    const title = metadata.title || (outlineChapter && outlineChapter.title) || rep.chapter_id || `Chapter ${idx + 1}`;
    const content = rep.content || '';
    const words = content.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Parse provenance
    let chunkIds = [];
    if (rep.provenance) {
      try {
        chunkIds = typeof rep.provenance === 'string' ? JSON.parse(rep.provenance) : rep.provenance;
      } catch (_) {
        chunkIds = [];
      }
    }
    if ((!chunkIds || chunkIds.length === 0) && Array.isArray(metadata.provenance)) {
      chunkIds = metadata.provenance;
    }
    if (!Array.isArray(chunkIds)) {
      chunkIds = [];
    }

    chapterStats.push({
      index: idx + 1,
      title,
      wordCount,
      chunkCount: chunkIds.length,
      createdAt: rep.created_at,
    });

    // 3. Print for each chapter
    out('--------------------------------------------------------------------------------');
    out(`Chapter ${idx + 1}: ${title}`);
    out(`Book ID:    ${rep.book_id}`);
    out(`Word Count: ${wordCount} words`);
    out(`Created At: ${rep.created_at}`);
    out('--------------------------------------------------------------------------------\n');

    out(content);
    out('');

    out(`Provenance: ${chunkIds.length} source chunk ID(s)`);
    if (chunkIds.length === 0) {
      out('  (No source chunks associated)');
    } else {
      for (let cIdx = 0; cIdx < chunkIds.length; cIdx++) {
        const cId = chunkIds[cIdx];
        const chunk = chunkStmt.get(cId);
        if (chunk && chunk.text_content) {
          const raw = chunk.text_content.replace(/\s+/g, ' ').trim();
          const snippet = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
          out(`  [${cIdx + 1}] ${cId}: ${snippet}`);
        } else {
          out(`  [${cIdx + 1}] ${cId}: [Chunk content not found in semantic_chunks]`);
        }
      }
    }
    out('\n');
  }

  // 4. Print summary at the end
  out('================================================================================');
  out('SYNTHESIS SUMMARY');
  out('================================================================================');
  out(`Book Title:                ${bookTitle}`);
  out(`Total Synthesized Chapters: ${chapterStats.length}`);

  const wordCounts = chapterStats.map((c) => c.wordCount);
  const minWc = Math.min(...wordCounts);
  const maxWc = Math.max(...wordCounts);
  const sumWc = wordCounts.reduce((acc, v) => acc + v, 0);
  const meanWc = (sumWc / wordCounts.length).toFixed(1);

  out(`Word Count Range:          min ${minWc} / max ${maxWc} / mean ${meanWc}`);

  // Chapters with word count outside 250-350
  const outsideTarget = chapterStats.filter((c) => c.wordCount < 250 || c.wordCount > 350);
  out(`Chapters Outside 250-350:  ${outsideTarget.length}`);
  if (outsideTarget.length === 0) {
    out('  None');
  } else {
    for (const c of outsideTarget) {
      out(`  - [Ch ${c.index}] "${c.title}" (${c.wordCount} words)`);
    }
  }

  // Chapters with empty provenance
  const emptyProv = chapterStats.filter((c) => c.chunkCount === 0);
  out(`Chapters Empty Provenance: ${emptyProv.length}`);
  if (emptyProv.length === 0) {
    out('  None');
  } else {
    for (const c of emptyProv) {
      out(`  - [Ch ${c.index}] "${c.title}" (0 source chunks)`);
    }
  }
  out('================================================================================\n');

  const reportText = lines.join('\n');

  // Print to stdout
  process.stdout.write(reportText);

  // 5. ALSO write the same output to: tmp/synthesis-report-<ISO-timestamp>.txt
  const tmpDir = path.join(ROOT_DIR, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const isoTimestamp = new Date().toISOString().replace(/:/g, '-');
  const reportFileName = `synthesis-report-${isoTimestamp}.txt`;
  const reportFilePath = path.join(tmpDir, reportFileName);

  fs.writeFileSync(reportFilePath, reportText, 'utf8');
  console.log(`[diagnose-synthesis] Report written to: ${reportFilePath}`);

  process.exit(0);
}

run();

