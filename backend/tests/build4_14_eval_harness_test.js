/**
 * Build 4.14 Compression Evaluation Harness Test
 *
 * Measures:
 * 1. Output word counts (bounds: [180, 450])
 * 2. Source-to-output compression ratios (target band: [4, 10], optimal: [6, 8])
 * 3. Provenance chunk linkage on every synthesized chapter
 * 4. Aggregate evaluation statistics written to tmp/eval-report.json
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db/database');

async function runEvalHarness() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 4.14: COMPRESSION EVALUATION HARNESS');
  console.log('================================================================\n');

  const db = getDatabase();
  const rootDir = path.resolve(__dirname, '..', '..');
  const reportPath = path.join(rootDir, 'tmp', 'eval-report.json');

  // Step 1: Locate target book with EDITORIAL_SYNTHESIS representations
  // Check for canonical book first, or any book with representations
  const canonicalBook = db.prepare(`
    SELECT id, title FROM books 
    WHERE original_filename LIKE '%practical_machine_learning%' 
       OR title LIKE '%Practical Machine Learning%'
    ORDER BY created_at DESC LIMIT 1
  `).get();

  let targetBookId = null;
  let targetBookTitle = null;

  if (canonicalBook) {
    const repCount = db.prepare(`
      SELECT COUNT(id) as c FROM chapter_representations 
      WHERE book_id = ? AND type = 'EDITORIAL_SYNTHESIS'
    `).get(canonicalBook.id);
    if (repCount && repCount.c > 0) {
      targetBookId = canonicalBook.id;
      targetBookTitle = canonicalBook.title;
    }
  }

  if (!targetBookId) {
    const candidate = db.prepare(`
      SELECT cr.book_id, b.title, COUNT(cr.id) as c 
      FROM chapter_representations cr
      LEFT JOIN books b ON b.id = cr.book_id
      WHERE cr.type = 'EDITORIAL_SYNTHESIS'
      GROUP BY cr.book_id
      ORDER BY c DESC, cr.rowid DESC
      LIMIT 1
    `).get();

    if (candidate && candidate.c > 0) {
      targetBookId = candidate.book_id;
      targetBookTitle = candidate.title || candidate.book_id;
    }
  }

  // If no representations exist, skip cleanly
  if (!targetBookId) {
    console.log('[Notice] No EDITORIAL_SYNTHESIS representations found in DB.');
    console.log('[Skip] Skipping compression evaluation cleanly (requires prior synthesis run).\n');
    const emptyReport = {
      bookId: null,
      chapterCount: 0,
      perChapter: [],
      summary: { minRatio: 0, maxRatio: 0, meanRatio: 0, minWords: 0, maxWords: 0 },
      latenciesMs: [],
      skipped: true,
      reason: 'no_representations_in_db'
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(emptyReport, null, 2), 'utf8');
    return;
  }

  console.log(`[Target] Evaluating book: ${targetBookId} ("${targetBookTitle}")`);

  // Step 2: Query all EDITORIAL_SYNTHESIS representations for that book
  const reps = db.prepare(`
    SELECT id, chapter_id, content, metadata_json, created_at
    FROM chapter_representations
    WHERE book_id = ? AND type = 'EDITORIAL_SYNTHESIS'
    ORDER BY created_at ASC
  `).all(targetBookId);

  console.log(`[Found] ${reps.length} EDITORIAL_SYNTHESIS representation(s).\n`);

  if (reps.length === 0) {
    console.log('[Skip] 0 representations found for target book.');
    return;
  }

  // Step 3 & 4: Compute metrics & check per-chapter assertions
  const perChapter = [];
  const outliers = [];
  const latenciesMs = [];

  for (let idx = 0; idx < reps.length; idx++) {
    const rep = reps[idx];
    let meta = {};
    try {
      meta = typeof rep.metadata_json === 'string' ? JSON.parse(rep.metadata_json) : (rep.metadata_json || {});
    } catch {
      meta = {};
    }

    const wordCount = rep.content ? rep.content.trim().split(/\s+/).filter(Boolean).length : 0;

    let sourceWords = meta.source_word_count;
    const provenance = Array.isArray(meta.provenance) ? meta.provenance : [];
    const hasProvenance = provenance.length > 0;

    if (typeof sourceWords !== 'number' || sourceWords <= 0) {
      // Estimate from linked chunks if absent
      if (provenance.length > 0) {
        const placeholders = provenance.map(() => '?').join(',');
        const chunks = db.prepare(`SELECT text_content, content FROM semantic_chunks WHERE id IN (${placeholders})`).all(...provenance);
        sourceWords = chunks.reduce((sum, ch) => {
          const txt = ch.text_content || ch.content || '';
          return sum + txt.trim().split(/\s+/).filter(Boolean).length;
        }, 0);
      } else {
        sourceWords = 0;
      }
    }

    const ratio = wordCount > 0 ? Number((sourceWords / wordCount).toFixed(2)) : 0;

    if (typeof meta.latencyMs === 'number') {
      latenciesMs.push(meta.latencyMs);
    } else if (typeof meta.durationMs === 'number') {
      latenciesMs.push(meta.durationMs);
    }

    // Mandatory provenance check per chapter
    assert.strictEqual(
      hasProvenance,
      true,
      `Chapter representation ${rep.id} must have non-empty provenance array`
    );

    // Track outliers for bounds and ratio
    const chapterLabel = meta.title || rep.chapter_id || `Chapter ${idx + 1}`;
    console.log(`  [Ch ${idx + 1}] "${chapterLabel}": ${wordCount} words, ${sourceWords} source words (ratio: ${ratio}:1, ${provenance.length} source chunks)`);

    if (wordCount < 180 || wordCount > 450) {
      outliers.push({ id: rep.id, issue: 'word_count_out_of_bounds', wordCount, bounds: [180, 450] });
      console.warn(`    ⚠️  Outlier: Word count ${wordCount} outside hard bounds [180, 450]`);
    }

    if (ratio < 4.0 || ratio > 10.0) {
      outliers.push({ id: rep.id, issue: 'ratio_out_of_band', ratio, band: [4, 10] });
      console.warn(`    ⚠️  Outlier: Compression ratio ${ratio}:1 outside target band [4, 10]`);
    }

    perChapter.push({
      id: rep.id,
      chapterId: rep.chapter_id,
      title: meta.title || '',
      wordCount,
      sourceWords,
      ratio,
      hasProvenance,
      chunkCount: provenance.length
    });
  }

  // Step 5: Aggregate summary
  const ratios = perChapter.map((c) => c.ratio);
  const wordCounts = perChapter.map((c) => c.wordCount);

  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);
  const meanRatio = Number((ratios.reduce((sum, r) => sum + r, 0) / ratios.length).toFixed(2));
  const minWords = Math.min(...wordCounts);
  const maxWords = Math.max(...wordCounts);

  const summary = {
    minRatio,
    maxRatio,
    meanRatio,
    minWords,
    maxWords,
  };

  const report = {
    bookId: targetBookId,
    bookTitle: targetBookTitle,
    chapterCount: perChapter.length,
    perChapter,
    outliers,
    summary,
    latenciesMs,
    generatedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[Report] Evaluation written to ${reportPath}`);
  console.log('[Report Summary]:', JSON.stringify(summary, null, 2));

  // Step 6: Aggregate assertions
  if (meanRatio < 6.0 || meanRatio > 8.0) {
    console.warn(`\n[Warning] Aggregate meanRatio (${meanRatio}:1) is outside the optimal [6, 8] band.`);
  }

  assert(
    meanRatio >= 5.0 && meanRatio <= 9.0,
    `Aggregate mean compression ratio ${meanRatio} outside acceptable bounds [5, 9]`
  );

  console.log('\n================================================================');
  console.log('🎉 COMPRESSION EVALUATION HARNESS PASSED');
  console.log('================================================================\n');
}

runEvalHarness()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch((err) => {
    console.error('\n❌ COMPRESSION EVALUATION HARNESS FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });

