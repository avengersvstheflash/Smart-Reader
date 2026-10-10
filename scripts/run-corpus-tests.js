// Slow-tier cross-format test. Run manually:
//   node scripts/run-corpus-tests.js
// Not part of the default test suite. See docs/ROADMAP for context.

const fs = require('fs');
const path = require('path');

// Isolate DB for corpus testing
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'storage', 'test-data.db');

const ingestionService = require('../backend/services/ingestion/ingestionService');

const CORPUS_DIR = path.join(__dirname, '..', 'backend', 'tests', 'fixtures', 'corpus');
const VALID_EXTENSIONS = new Set(['.epub', '.pdf', '.docx', '.rtf', '.txt', '.md', '.html', '.htm']);

async function findCorpusFiles() {
  if (!fs.existsSync(CORPUS_DIR)) {
    throw new Error(`Corpus directory not found: ${CORPUS_DIR}`);
  }

  const subdirs = fs.readdirSync(CORPUS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const files = [];

  for (const subdir of subdirs) {
    const subdirPath = path.join(CORPUS_DIR, subdir);
    const entries = fs.readdirSync(subdirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        files.push({
          subdir,
          filename: file,
          fullPath: path.join(subdirPath, file),
          relPath: `${subdir}/${file}`,
        });
      }
    }
  }

  return files;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  console.log('================================================================');
  console.log('📚 RUNNING CROSS-FORMAT CORPUS TESTS (F42)');
  console.log(`Corpus root: ${CORPUS_DIR}`);
  console.log('================================================================\n');

  const files = await findCorpusFiles();
  if (files.length === 0) {
    console.warn('[Warning] No valid test fixtures found in corpus directories.');
    process.exit(0);
  }

  const results = [];
  const failures = [];

  for (const item of files) {
    process.stdout.write(`Testing ${item.relPath}... `);
    const t0 = Date.now();
    try {
      const fileBuffer = fs.readFileSync(item.fullPath);
      const res = await ingestionService.ingest({
        originalFilename: item.filename,
        fileBuffer,
        title: item.filename,
      });

      const elapsedMs = Date.now() - t0;
      const format = res.format || path.extname(item.filename).slice(1);
      const chapterCount = Array.isArray(res.chapters) ? res.chapters.length : 0;
      let wordCount = res.totalWordCount || 0;
      if (!wordCount && Array.isArray(res.chapters)) {
        wordCount = res.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
      }

      // Assertions: chapter_count > 0, word_count > 100
      let passed = true;
      let errorMsg = null;

      if (chapterCount <= 0) {
        passed = false;
        errorMsg = `Assertion failed: chapter_count must be > 0 (got ${chapterCount})`;
      } else if (wordCount <= 100) {
        passed = false;
        errorMsg = `Assertion failed: word_count must be > 100 (got ${wordCount})`;
      }

      const row = {
        fixture: item.relPath,
        format,
        time: formatDuration(elapsedMs),
        chapters: chapterCount,
        words: wordCount,
        result: passed ? 'PASS' : 'FAIL',
        error: errorMsg,
      };

      results.push(row);
      if (!passed) {
        failures.push({ fixture: item.relPath, error: errorMsg });
        console.log(`FAIL (${errorMsg})`);
      } else {
        console.log(`PASS (${row.format}, ${chapterCount} ch, ${wordCount} words in ${row.time})`);
      }
    } catch (err) {
      const elapsedMs = Date.now() - t0;
      const errorMsg = err.message || String(err);
      const row = {
        fixture: item.relPath,
        format: path.extname(item.filename).slice(1) || 'unknown',
        time: formatDuration(elapsedMs),
        chapters: 0,
        words: 0,
        result: 'FAIL',
        error: errorMsg,
      };
      results.push(row);
      failures.push({ fixture: item.relPath, error: errorMsg, stack: err.stack });
      console.log(`FAIL (Exception: ${errorMsg})`);
    }
  }

  // Print Summary Table
  console.log('\n================================================================');
  console.log('📊 CORPUS TEST SUMMARY TABLE');
  console.log('================================================================');

  const headers = ['Fixture', 'Format', 'Time', 'Chapters', 'Words', 'Result'];
  const colWidths = {
    fixture: Math.max(...results.map((r) => r.fixture.length), headers[0].length),
    format: Math.max(...results.map((r) => r.format.length), headers[1].length),
    time: Math.max(...results.map((r) => r.time.length), headers[2].length),
    chapters: Math.max(...results.map((r) => String(r.chapters).length), headers[3].length),
    words: Math.max(...results.map((r) => String(r.words).length), headers[4].length),
    result: Math.max(...results.map((r) => r.result.length), headers[5].length),
  };

  const pad = (str, len, right = false) => {
    const s = String(str);
    return right ? s.padStart(len) : s.padEnd(len);
  };

  const headerLine = [
    pad(headers[0], colWidths.fixture),
    pad(headers[1], colWidths.format),
    pad(headers[2], colWidths.time, true),
    pad(headers[3], colWidths.chapters, true),
    pad(headers[4], colWidths.words, true),
    pad(headers[5], colWidths.result),
  ].join(' | ');

  const separator = [
    '-'.repeat(colWidths.fixture),
    '-'.repeat(colWidths.format),
    '-'.repeat(colWidths.time),
    '-'.repeat(colWidths.chapters),
    '-'.repeat(colWidths.words),
    '-'.repeat(colWidths.result),
  ].join('-+-');

  console.log(headerLine);
  console.log(separator);

  for (const r of results) {
    const line = [
      pad(r.fixture, colWidths.fixture),
      pad(r.format, colWidths.format),
      pad(r.time, colWidths.time, true),
      pad(r.chapters, colWidths.chapters, true),
      pad(r.words, colWidths.words, true),
      pad(r.result, colWidths.result),
    ].join(' | ');
    console.log(line);
  }

  console.log('================================================================');

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} fixture(s) failed ingestion:\n`);
    for (const f of failures) {
      console.error(`[${f.fixture}]: ${f.error}`);
      if (f.stack) {
        console.error(`  Stack: ${f.stack}\n`);
      }
    }
    process.exit(1);
  } else {
    console.log(`\n✅ All ${results.length} corpus fixtures passed ingestion validation.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});

