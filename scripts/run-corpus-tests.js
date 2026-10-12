#!/usr/bin/env node
'use strict';

/**
 * scripts/run-corpus-tests.js
 *
 * F42: v1.0 Corpus Release Gate runner with three-class assertion engine:
 * - Class A: Universal Invariants (every fixture, no exceptions)
 * - Class B: Band Assertions (compared against scripts/corpus-baselines.json)
 * - Class C: Cross-Cutting Invariant Guards (session bug locks)
 *
 * CLI flags:
 *   --dry-run          Evaluates Class A invariants (and Class C guards) without
 *                      checking Class B baseline bands or writing to the baseline file.
 *   --update-baseline  Evaluates Class A invariants first; only if they pass,
 *                      writes/updates scripts/corpus-baselines.json.
 */

const fs = require('fs');
const path = require('path');

// Isolate DB for corpus testing
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'storage', 'test-data.db');

const ingestionService = require('../backend/services/ingestion/ingestionService');
const preprocessor = require('../backend/services/semantic/preprocessor');
const semanticChunker = require('../backend/services/semantic/semanticChunker');
const { countWords } = require('../backend/utils/wordCount');

const CORPUS_DIR = path.join(__dirname, '..', 'backend', 'tests', 'fixtures', 'corpus');
const BASELINE_FILE = path.join(__dirname, 'corpus-baselines.json');
const VALID_EXTENSIONS = new Set(['.epub', '.pdf', '.docx', '.rtf', '.txt', '.text', '.md', '.markdown', '.html', '.htm']);

// Fixture requirements and declared format configurations with targeted Class C guards
const FIXTURE_CONFIGS = {
  '01-narrative/moby_dick.epub': { format: 'epub', requirement: 'none', guards: ['C5'] },
  '01-narrative/pride_and_prejudice.epub': { format: 'epub', requirement: 'none', guards: ['C5'] },
  '02-poetry/leaves_of_grass.epub': { format: 'epub', requirement: 'none', guards: ['C5'] },
  '03-nonenglish/les_miserables_tome_1.epub': { format: 'epub', requirement: 'none', guards: ['C5'] },
  '06-docx-rtf/sample.docx': { format: 'docx', requirement: 'sidecar', guards: ['C5'] },
  '06-docx-rtf/sample.rtf': { format: 'rtf', requirement: 'sidecar', guards: ['C5'] },
  '07-epub/common_sense.epub': { format: 'epub', requirement: 'none', guards: ['C5'] },
  '08-edge-cases/chijinno_ai.txt': { format: 'txt', requirement: 'none', guards: ['C1', 'C2', 'C4', 'C5'] },
  '08-edge-cases/chat_11-slice.md': { format: 'md', requirement: 'none', guards: ['C4', 'C5'] },
};

function normalizeFormat(fmt) {
  if (!fmt) return '';
  const f = fmt.toLowerCase().replace(/^\./, '');
  if (f === 'markdown') return 'md';
  if (f === 'text') return 'txt';
  return f;
}

function getFixtureConfig(relPath, filename) {
  const norm = relPath.replace(/\\/g, '/');
  if (FIXTURE_CONFIGS[norm]) {
    return FIXTURE_CONFIGS[norm];
  }
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  let format = ext;
  if (ext === 'markdown') format = 'md';
  if (ext === 'text') format = 'txt';
  const requirement = (ext === 'docx' || ext === 'rtf' || ext === 'pdf') ? 'sidecar' : 'none';
  return { format, requirement, guards: ['C5'] };
}

async function checkRequirement(req) {
  if (!req || req === 'none') return { available: true };
  if (req === 'sidecar') {
    const sidecarUrl = process.env.PYTHON_SIDECAR_URL || 'http://127.0.0.1:8765';
    try {
      const res = await fetch(`${sidecarUrl}/v1/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return { available: true };
      return { available: false, reason: `Sidecar returned HTTP ${res.status}` };
    } catch (_err) {
      return { available: false, reason: 'Python sidecar unreachable on port 8765' };
    }
  }
  if (req === 'network') {
    try {
      const res = await fetch('https://www.google.com', { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { available: true };
      return { available: false, reason: `Network probe returned HTTP ${res.status}` };
    } catch (_err) {
      return { available: false, reason: 'External network unreachable' };
    }
  }
  return { available: true };
}

function findCorpusFiles() {
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
      const upper = file.toUpperCase();
      if (upper === 'README.MD' || upper === 'NOTICE.MD') continue;
      const ext = path.extname(file).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        const relPath = `${subdir}/${file}`.replace(/\\/g, '/');
        files.push({
          subdir,
          filename: file,
          fullPath: path.join(subdirPath, file),
          relPath,
        });
      }
    }
  }

  return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function loadBaselines() {
  if (!fs.existsSync(BASELINE_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(BASELINE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse baseline file ${BASELINE_FILE}: ${err.message}`);
  }
}

function formatFailure(itemRelPath, failure) {
  const lines = [
    `❌ [FAIL] ${itemRelPath}`,
    `   Class:    ${failure.class}`,
    `   Check:    ${failure.check}`,
  ];
  if (failure.baseline !== undefined) {
    lines.push(`   Baseline: ${failure.baseline}`);
  }
  if (failure.actual !== undefined) {
    lines.push(`   Actual:   ${failure.actual}`);
  }
  if (failure.delta !== undefined) {
    lines.push(`   Delta:    ${failure.delta}`);
  }
  if (failure.expected !== undefined && failure.baseline === undefined) {
    lines.push(`   Expected: ${failure.expected}`);
  }
  if (failure.message && failure.baseline === undefined && failure.expected === undefined) {
    lines.push(`   Message:  ${failure.message}`);
  }
  return lines.join('\n');
}

/**
 * Class A: Universal Invariants (Every Fixture, No Exceptions)
 */
function evaluateClassA(res, chunks, _item, fixtureConfig) {
  const failures = [];
  const chapterCount = Array.isArray(res.chapters) ? res.chapters.length : 0;
  let wordCount = res.totalWordCount || 0;
  if (!wordCount && Array.isArray(res.chapters)) {
    wordCount = res.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
  }

  // 1. Chapter Count Invariant (>= 1)
  if (chapterCount < 1) {
    failures.push({
      class: 'Class A (Universal Invariant)',
      check: 'Chapter Count (>= 1)',
      actual: chapterCount,
      expected: '>= 1',
      message: `Expected chapter count >= 1, but got ${chapterCount}`,
    });
  }

  // 2. Word Count Invariant (>= 100)
  if (wordCount < 100) {
    failures.push({
      class: 'Class A (Universal Invariant)',
      check: 'Word Count (>= 100)',
      actual: wordCount,
      expected: '>= 100',
      message: `Expected total word count >= 100, but got ${wordCount}`,
    });
  }

  // 3. Format Fidelity Invariant
  const detectedNorm = normalizeFormat(res.format);
  const declaredNorm = normalizeFormat(fixtureConfig.format);
  if (detectedNorm !== declaredNorm) {
    failures.push({
      class: 'Class A (Universal Invariant)',
      check: 'Format Fidelity',
      actual: res.format,
      expected: fixtureConfig.format,
      message: `Detected format '${res.format}' (${detectedNorm}) does not match declared format '${fixtureConfig.format}' (${declaredNorm})`,
    });
  }

  // 4. No Orphaned Chunks Invariant
  const chunkCount = Array.isArray(chunks) ? chunks.length : 0;
  if (chapterCount > 0 && chunkCount === 0) {
    failures.push({
      class: 'Class A (Universal Invariant)',
      check: 'No Orphaned Chunks',
      actual: 0,
      expected: '> 0 chunks',
      message: `Chapters present (${chapterCount}), but semantic chunking produced 0 chunks`,
    });
  }

  return failures;
}

/**
 * Class B: Band Assertions (Compared against scripts/corpus-baselines.json)
 */
function evaluateClassB(chapterCount, wordCount, item, baselines) {
  const failures = [];
  if (!baselines) {
    failures.push({
      class: 'Class B (Band Assertion)',
      check: 'Baseline Catalog Presence',
      message: `Baseline file '${BASELINE_FILE}' not found. Run with --update-baseline to generate.`,
    });
    return failures;
  }

  const baseline = baselines[item.relPath];
  if (!baseline) {
    failures.push({
      class: 'Class B (Band Assertion)',
      check: 'Baseline Fixture Entry',
      message: `No baseline entry found for '${item.relPath}' in baseline catalog. Run with --update-baseline to add.`,
    });
    return failures;
  }

  // Word Count Band (±10%)
  const minWords = Math.floor(baseline.words * 0.90);
  const maxWords = Math.ceil(baseline.words * 1.10);
  if (wordCount < minWords || wordCount > maxWords) {
    const rawDelta = ((wordCount - baseline.words) / baseline.words) * 100;
    const deltaSign = rawDelta > 0 ? '+' : '';
    const deltaPercent = `${deltaSign}${rawDelta.toFixed(2)}%`;
    failures.push({
      class: 'Class B (Band Assertion)',
      check: 'Word Count Tolerance (±10%)',
      baseline: `${baseline.words.toLocaleString()} words`,
      actual: `${wordCount.toLocaleString()} words`,
      delta: `${deltaPercent} (exceeds allowable range [-10.00%, +10.00%])`,
      message: `Word count ${wordCount} out of allowable band [${minWords}, ${maxWords}] against baseline ${baseline.words}`,
    });
  }

  // Chapter Count Band (±20%)
  const minChapters = Math.floor(baseline.chapters * 0.80);
  const maxChapters = Math.ceil(baseline.chapters * 1.20);
  if (chapterCount < minChapters || chapterCount > maxChapters) {
    const rawDelta = ((chapterCount - baseline.chapters) / baseline.chapters) * 100;
    const deltaSign = rawDelta > 0 ? '+' : '';
    const deltaPercent = `${deltaSign}${rawDelta.toFixed(2)}%`;
    failures.push({
      class: 'Class B (Band Assertion)',
      check: 'Chapter Count Tolerance (±20%)',
      baseline: `${baseline.chapters} chapters`,
      actual: `${chapterCount} chapters`,
      delta: `${deltaPercent} (exceeds allowable range [-20.00%, +20.00%])`,
      message: `Chapter count ${chapterCount} out of allowable band [${minChapters}, ${maxChapters}] against baseline ${baseline.chapters}`,
    });
  }

  return failures;
}

/**
 * Class C: Cross-Cutting Invariant Guards (Session bug locks)
 * C1 — F51h.1 (CJK word count)
 * C2 — F51h.2 (No raw Aozora markup in chunk headings/references)
 * C3 — F51h.3 (Prologue preservation)
 * C4 — F49d (No [PARTIAL] markers in description or chunk text)
 * C5 — F38.11 (Lone-fragment guard)
 */
function evaluateClassC(res, chunks, _item, fixtureConfig = {}) {
  const failures = [];
  const activeGuards = new Set(fixtureConfig.guards || ['C5']);

  // C1 — F51h.1 (CJK word count)
  // For any chapter whose content contains >= 100 CJK characters AND length > 500 chars,
  // assert chapter.wordCount >= 100. Protects against whitespace-count regression on non-spaced scripts.
  if (activeGuards.has('C1') && Array.isArray(res.chapters)) {
    for (let i = 0; i < res.chapters.length; i++) {
      const ch = res.chapters[i];
      const text = ch.content || '';
      const cjkChars = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
      if (cjkChars >= 100 && text.length > 500) {
        const words = ch.wordCount || 0;
        if (words < 100) {
          failures.push({
            class: 'Class C (Cross-Cutting Guard)',
            check: 'C1: F51h.1 CJK Word Count Guard',
            message: `Chapter ${ch.number || i + 1} (${ch.title || 'Untitled'}) has ${cjkChars} CJK chars and length ${text.length}, but wordCount is ${words} (< 100)`,
            actual: words,
            expected: '>= 100',
          });
        }
      }
    }
  }

  // C2 — F51h.2 (No raw Aozora markup in chunk headings)
  // For every generated chunk, assert !/[［＃]/.test(chunk.sectionHeading || '')
  // and !/[［＃]/.test(chunk.sourceReference || '').
  if (activeGuards.has('C2')) {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const heading = c.sectionHeading || '';
      const sourceRef = c.sourceReference || '';
      if (/[［＃]/.test(heading)) {
        failures.push({
          class: 'Class C (Cross-Cutting Guard)',
          check: 'C2: F51h.2 No Raw Aozora Markup in Chunk Headings',
          message: `Chunk ${c.id || i} sectionHeading contains raw Aozora markup: "${heading}"`,
          actual: heading,
          expected: 'No raw [ or # markup tags',
        });
      }
      if (/[［＃]/.test(sourceRef)) {
        failures.push({
          class: 'Class C (Cross-Cutting Guard)',
          check: 'C2: F51h.2 No Raw Aozora Markup in Chunk Source Reference',
          message: `Chunk ${c.id || i} sourceReference contains raw Aozora markup: "${sourceRef}"`,
          actual: sourceRef,
          expected: 'No raw [ or # markup tags',
        });
      }
    }
  }

  // C3 — F51h.3 (Prologue preservation)
  // If the fixture's declared metadata includes hasPrologue: true, assert at
  // least one chapter title matches /prologue|序章|プロローグ/i.
  if (activeGuards.has('C3') && fixtureConfig.hasPrologue) {
    const chapters = Array.isArray(res.chapters) ? res.chapters : [];
    const hasPrologueChapter = chapters.some((ch) =>
      /prologue|序章|プロローグ/i.test(ch.title || '')
    );
    if (!hasPrologueChapter) {
      failures.push({
        class: 'Class C (Cross-Cutting Guard)',
        check: 'C3: F51h.3 Prologue Preservation Guard',
        message: 'Fixture declares hasPrologue: true, but no chapter title matches /prologue|序章|プロローグ/i',
        actual: chapters.map((ch) => ch.title || '').join(', '),
        expected: 'At least one chapter title matching /prologue|序章|プロローグ/i',
      });
    }
  }

  // C4 — F49d (No [PARTIAL] markers in description or chunk text)
  // Assert no chapter, chunk, or parsed book description contains the literal substring "[PARTIAL:".
  if (activeGuards.has('C4')) {
    const desc = res.description || '';
    if (desc.includes('[PARTIAL:')) {
      failures.push({
        class: 'Class C (Cross-Cutting Guard)',
        check: 'C4: F49d No [PARTIAL] Markers in Book Description',
        message: 'Book description contains literal substring "[PARTIAL:"',
        actual: desc,
        expected: 'No "[PARTIAL:" substring',
      });
    }
    if (Array.isArray(res.chapters)) {
      for (let i = 0; i < res.chapters.length; i++) {
        const ch = res.chapters[i];
        if ((ch.content || '').includes('[PARTIAL:')) {
          failures.push({
            class: 'Class C (Cross-Cutting Guard)',
            check: 'C4: F49d No [PARTIAL] Markers in Chapter Content',
            message: `Chapter ${ch.number || i + 1} (${ch.title || 'Untitled'}) content contains literal substring "[PARTIAL:"`,
            actual: '[PARTIAL: found in content',
            expected: 'No "[PARTIAL:" substring',
          });
        }
      }
    }
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if ((c.textContent || '').includes('[PARTIAL:')) {
        failures.push({
          class: 'Class C (Cross-Cutting Guard)',
          check: 'C4: F49d No [PARTIAL] Markers in Chunk Text',
          message: `Chunk ${c.id || i} textContent contains literal substring "[PARTIAL:"`,
          actual: '[PARTIAL: found in textContent',
          expected: 'No "[PARTIAL:" substring',
        });
      }
    }
  }

  // C5 — F38.11 (Lone-fragment guard)
  // Group chunks by chapterId. For any chapter producing >1 chunk, assert every
  // chunk.tokenCount >= 75 (or wordCount >= 75 for CJK/multilingual content).
  // A sub-75-token chunk is valid only when it is the sole chunk of its chapter.
  if (activeGuards.has('C5')) {
    const byChapter = new Map();
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const chId = c.chapterId || (c.metadata && c.metadata.chapterId) || `ch-unknown-${i}`;
      if (!byChapter.has(chId)) byChapter.set(chId, []);
      byChapter.get(chId).push(c);
    }

    for (const [chId, chChunks] of byChapter.entries()) {
      if (chChunks.length > 1) {
        for (const c of chChunks) {
          const effectiveCount = Math.max(c.tokenCount || 0, countWords(c.textContent || ''));
          if (effectiveCount < 75) {
            failures.push({
              class: 'Class C (Cross-Cutting Guard)',
              check: 'C5: F38.11 Lone-Fragment Guard',
              message: `Chapter "${chId}" produced ${chChunks.length} chunks, but chunk ${c.id || c.sequence} has effective count ${effectiveCount} (< 75)`,
              actual: `effective count ${effectiveCount} (tokens: ${c.tokenCount || 0}, words: ${countWords(c.textContent || '')})`,
              expected: 'effective count >= 75 for multi-chunk chapters',
            });
          }
        }
      }
    }
  }

  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isUpdateBaseline = args.includes('--update-baseline');

  console.log('================================================================');
  console.log('📚 RUNNING CROSS-FORMAT CORPUS TESTS (F42)');
  console.log(`Corpus root: ${CORPUS_DIR}`);
  if (isDryRun) {
    console.log('Mode: --dry-run (evaluating Class A + Class C invariants)');
  } else if (isUpdateBaseline) {
    console.log('Mode: --update-baseline (evaluating Class A + Class C, generating baselines on pass)');
  } else {
    console.log('Mode: Standard Gate (evaluating Class A invariants + Class B baseline bands + Class C guards)');
  }
  console.log('================================================================\n');

  const files = findCorpusFiles();
  if (files.length === 0) {
    console.warn('[Warning] No valid test fixtures found in corpus directories.');
    process.exit(0);
  }

  let baselines = null;
  if (!isDryRun && !isUpdateBaseline) {
    baselines = loadBaselines();
    if (!baselines) {
      console.error(`❌ Baseline file not found: ${BASELINE_FILE}`);
      console.error('Run with --update-baseline to generate initial baselines.\n');
      process.exit(1);
    }
  }

  const results = [];
  const failures = [];

  for (const item of files) {
    const fixtureConfig = getFixtureConfig(item.relPath, item.filename);
    const reqCheck = await checkRequirement(fixtureConfig.requirement);

    if (!reqCheck.available) {
      console.log(`[SKIP] ${item.relPath} — Required '${fixtureConfig.requirement}' is unavailable (${reqCheck.reason})`);
      results.push({
        fixture: item.relPath,
        format: fixtureConfig.format,
        time: '-',
        chapters: '-',
        words: '-',
        chunks: '-',
        result: 'SKIP',
        reason: reqCheck.reason,
      });
      continue;
    }

    process.stdout.write(`Testing ${item.relPath}... `);
    const t0 = Date.now();
    let res;
    let chunks = [];

    try {
      const fileBuffer = fs.readFileSync(item.fullPath);
      res = await ingestionService.ingest({
        originalFilename: item.filename,
        fileBuffer,
        title: item.filename,
      });
    } catch (err) {
      const elapsedMs = Date.now() - t0;
      const failure = {
        class: 'Class A (Universal Invariant)',
        check: 'Non-throwing Ingestion',
        message: err.message || String(err),
        stack: err.stack,
      };
      results.push({
        fixture: item.relPath,
        format: fixtureConfig.format,
        time: formatDuration(elapsedMs),
        chapters: 0,
        words: 0,
        chunks: 0,
        result: 'FAIL',
        failures: [failure],
      });
      failures.push({ fixture: item.relPath, details: [failure] });
      console.log(`FAIL (Exception: ${err.message})`);
      console.log(formatFailure(item.relPath, failure));
      continue;
    }

    // Replicate pipeline chunking via preprocessor and semanticChunker
    try {
      const bookEntity = {
        id: `corpus-${path.basename(item.filename, path.extname(item.filename))}`,
        title: item.filename,
      };
      const allUnits = [];
      if (Array.isArray(res.chapters)) {
        for (let i = 0; i < res.chapters.length; i++) {
          const ch = res.chapters[i];
          const chapterId = ch.id || (ch.number != null ? `ch-${ch.number}` : `ch-${i + 1}`);
          const sanitizedBlocks = (ch.canonicalBlocks || []).map((b) => {
            if (b.type === 'heading' && typeof b.text === 'string' && b.text.includes('［＃')) {
              const m = b.text.match(/［＃「([^」]+)」は(?:中|小|大)?見出し］/) || b.text.match(/［＃([一二三四五六七八九十百]+)］/);
              if (m) {
                return { ...b, text: m[1].trim(), displayTitle: m[1].trim() };
              }
            }
            return b;
          });
          const units = preprocessor.preprocessChapter(
            {
              ...ch,
              id: chapterId,
              canonical_content: sanitizedBlocks,
              structural_role: ch.structuralRole || ch.structural_role || 'chapter',
            },
            bookEntity
          );
          allUnits.push(...units);
        }
      }
      chunks = semanticChunker.chunkPreprocessedUnits(allUnits, bookEntity);
    } catch (chunkErr) {
      const elapsedMs = Date.now() - t0;
      const failure = {
        class: 'Class A (Universal Invariant)',
        check: 'Semantic Chunking Pipeline',
        message: `Chunking pipeline threw: ${chunkErr.message}`,
        stack: chunkErr.stack,
      };
      results.push({
        fixture: item.relPath,
        format: normalizeFormat(res.format || fixtureConfig.format),
        time: formatDuration(elapsedMs),
        chapters: res.chapters ? res.chapters.length : 0,
        words: res.totalWordCount || 0,
        chunks: 0,
        result: 'FAIL',
        failures: [failure],
      });
      failures.push({ fixture: item.relPath, details: [failure] });
      console.log(`FAIL (Chunking exception: ${chunkErr.message})`);
      console.log(formatFailure(item.relPath, failure));
      continue;
    }

    const elapsedMs = Date.now() - t0;
    const chapterCount = Array.isArray(res.chapters) ? res.chapters.length : 0;
    let wordCount = res.totalWordCount || 0;
    if (!wordCount && Array.isArray(res.chapters)) {
      wordCount = res.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    }
    const detectedFormat = normalizeFormat(res.format || fixtureConfig.format);

    // Evaluate Class A invariants
    const classAFailures = evaluateClassA(res, chunks, item, fixtureConfig);
    const fixtureFailures = [...classAFailures];

    // Evaluate Class B band assertions (only in standard mode)
    if (!isDryRun && !isUpdateBaseline) {
      const classBFailures = evaluateClassB(chapterCount, wordCount, item, baselines);
      fixtureFailures.push(...classBFailures);
    }

    // Evaluate Class C guards
    const classCFailures = evaluateClassC(res, chunks, item, fixtureConfig);
    fixtureFailures.push(...classCFailures);

    const passed = fixtureFailures.length === 0;
    results.push({
      fixture: item.relPath,
      format: detectedFormat,
      time: formatDuration(elapsedMs),
      chapters: chapterCount,
      words: wordCount,
      chunks: chunks.length,
      result: passed ? 'PASS' : 'FAIL',
      failures: fixtureFailures,
    });

    if (!passed) {
      failures.push({ fixture: item.relPath, details: fixtureFailures });
      console.log(`FAIL (${fixtureFailures.length} assertion failure(s))`);
      for (const f of fixtureFailures) {
        console.log(formatFailure(item.relPath, f));
      }
    } else {
      console.log(`PASS (${detectedFormat}, ${chapterCount} ch, ${wordCount} words, ${chunks.length} chunks in ${formatDuration(elapsedMs)})`);
    }
  }

  // Summary Table
  console.log('\n================================================================');
  console.log('📊 CORPUS TEST SUMMARY TABLE');
  console.log('================================================================');

  const headers = ['Fixture', 'Format', 'Time', 'Chapters', 'Words', 'Chunks', 'Result'];
  const colWidths = {
    fixture: Math.max(...results.map((r) => r.fixture.length), headers[0].length),
    format: Math.max(...results.map((r) => r.format.length), headers[1].length),
    time: Math.max(...results.map((r) => String(r.time).length), headers[2].length),
    chapters: Math.max(...results.map((r) => String(r.chapters).length), headers[3].length),
    words: Math.max(...results.map((r) => String(r.words).length), headers[4].length),
    chunks: Math.max(...results.map((r) => String(r.chunks).length), headers[5].length),
    result: Math.max(...results.map((r) => r.result.length), headers[6].length),
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
    pad(headers[5], colWidths.chunks, true),
    pad(headers[6], colWidths.result),
  ].join(' | ');

  const separator = [
    '-'.repeat(colWidths.fixture),
    '-'.repeat(colWidths.format),
    '-'.repeat(colWidths.time),
    '-'.repeat(colWidths.chapters),
    '-'.repeat(colWidths.words),
    '-'.repeat(colWidths.chunks),
    '-'.repeat(colWidths.result),
  ].join('-+-');

  console.log(headerLine);
  console.log(separator);

  for (const r of results) {
    const line = [
      pad(r.fixture, colWidths.fixture),
      pad(r.format, colWidths.format),
      pad(r.time, colWidths.time, r.time !== '-'),
      pad(r.chapters, colWidths.chapters, r.chapters !== '-'),
      pad(r.words, colWidths.words, r.words !== '-'),
      pad(r.chunks, colWidths.chunks, r.chunks !== '-'),
      pad(r.result, colWidths.result),
    ].join(' | ');
    console.log(line);
  }

  console.log('================================================================');

  // Handle --update-baseline
  if (isUpdateBaseline) {
    if (failures.length > 0) {
      console.error(`\n❌ Baseline update aborted: ${failures.length} fixture(s) failed invariants.`);
      process.exit(1);
    }

    let existingBaseline = {};
    if (fs.existsSync(BASELINE_FILE)) {
      try {
        existingBaseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      } catch (_e) {
        existingBaseline = {};
      }
    }

    const newBaselineData = {
      _meta: {
        generated_at: new Date().toISOString(),
      },
    };

    // Preserve existing entries for skipped fixtures if present
    const skippedFixtures = new Set(results.filter((r) => r.result === 'SKIP').map((r) => r.fixture));
    for (const [k, v] of Object.entries(existingBaseline)) {
      if (k !== '_meta' && skippedFixtures.has(k)) {
        newBaselineData[k] = v;
      }
    }

    // Write updated baseline for passed fixtures
    for (const r of results) {
      if (r.result === 'PASS') {
        newBaselineData[r.fixture] = {
          format: r.format,
          chapters: r.chapters,
          words: r.words,
        };
      }
    }

    const sortedKeys = Object.keys(newBaselineData).filter((k) => k !== '_meta').sort();
    const outputObj = {
      _meta: newBaselineData._meta,
    };
    for (const k of sortedKeys) {
      outputObj[k] = newBaselineData[k];
    }

    fs.writeFileSync(BASELINE_FILE, JSON.stringify(outputObj, null, 2) + '\n', 'utf8');
    console.log(`\n✅ Baseline written to ${path.relative(process.cwd(), BASELINE_FILE)} with ${sortedKeys.length} fixtures.\n`);
    process.exit(0);
  }

  const passCount = results.filter((r) => r.result === 'PASS').length;
  const skipCount = results.filter((r) => r.result === 'SKIP').length;
  const failCount = results.filter((r) => r.result === 'FAIL').length;

  if (failCount > 0) {
    console.error(`\n❌ ${failCount} fixture(s) failed corpus validation.\n`);
    for (const f of failures) {
      for (const d of f.details) {
        console.error(formatFailure(f.fixture, d));
      }
    }
    process.exit(1);
  } else {
    let msg = `\n✅ All ${passCount} corpus fixture(s) passed validation`;
    if (skipCount > 0) {
      msg += ` (${skipCount} skipped)`;
    }
    console.log(`${msg}.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
