#!/usr/bin/env node
'use strict';

/**
 * scripts/run-juncture-benchmark.js
 *
 * One-off juncture benchmark against external test documents.
 * Measures raw ingestion and semantic chunking throughput across real-world files.
 */

// Allow 100 MB import cap for large documents (e.g., Vienano 55.5 MB)
process.env.IMPORT_MAX_SIZE_MB = process.env.IMPORT_MAX_SIZE_MB || '100';

const fs = require('fs');
const path = require('path');

const ingestionService = require('../backend/services/ingestion/ingestionService');
const preprocessor = require('../backend/services/semantic/preprocessor');
const semanticChunker = require('../backend/services/semantic/semanticChunker');

const TARGET_DIR = 'C:\\Users\\Godsa\\Downloads\\Docs for tests';
const RESULTS_JSON_PATH = path.join(__dirname, 'juncture-benchmark-results.json');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scanDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) {
    throw new Error(`Target directory does not exist: ${dir}`);
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    // Skip hidden / OS lock files
    if (
      name.startsWith('.') ||
      name.startsWith('~$') ||
      name.toLowerCase() === 'desktop.ini' ||
      name.toLowerCase() === 'thumbs.db'
    ) {
      continue;
    }
    const fullPath = path.join(dir, name);
    if (entry.isDirectory()) {
      files = files.concat(scanDir(fullPath));
    } else if (entry.isFile()) {
      files.push({
        filename: name,
        fullPath,
        sizeBytes: fs.statSync(fullPath).size,
      });
    }
  }
  return files;
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('⚡ RUNNING JUNCTURE BENCHMARK');
  console.log(`Source directory: ${TARGET_DIR}`);
  console.log(`IMPORT_MAX_SIZE_MB: ${process.env.IMPORT_MAX_SIZE_MB}`);
  console.log('================================================================\n');

  const files = scanDir(TARGET_DIR);
  // Sort alphabetically by filename
  files.sort((a, b) => a.filename.localeCompare(b.filename));

  console.log(`Found ${files.length} test document(s) to benchmark.\n`);

  const results = [];
  const maxAttempts = 3;

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const { filename, fullPath, sizeBytes } = file;
    const progressPrefix = `[${idx + 1}/${files.length}] "${filename}" (${formatSize(sizeBytes)})`;
    console.log(`${progressPrefix}...`);

    let attempts = 0;
    let success = false;
    let lastError = null;
    let fileRecord = null;

    while (attempts < maxAttempts && !success) {
      attempts++;
      try {
        const fileBuffer = fs.readFileSync(fullPath);

        // 1. Ingestion timing
        const t0Parse = Date.now();
        const res = await ingestionService.ingest({
          originalFilename: filename,
          fileBuffer,
          title: filename,
        });
        const parse_ms = Date.now() - t0Parse;

        // 2. Chunking timing
        const t0Chunk = Date.now();
        const bookEntity = {
          id: `juncture-${path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          title: filename,
        };

        const allUnits = [];
        if (Array.isArray(res.chapters)) {
          for (let i = 0; i < res.chapters.length; i++) {
            const ch = res.chapters[i];
            const chapterId = ch.id || (ch.number != null ? `ch-${ch.number}` : `ch-${i + 1}`);
            const sanitizedBlocks = Array.isArray(ch.canonicalBlocks) && ch.canonicalBlocks.length > 0
              ? ch.canonicalBlocks.map((b) => {
                  if (b.type === 'heading' && typeof b.text === 'string' && b.text.includes('［＃')) {
                    const m = b.text.match(/［＃「([^」]+)」は(?:中|小|大)?見出し］/) || b.text.match(/［＃([一二三四五六七八九十百]+)］/);
                    if (m) {
                      return { ...b, text: m[1].trim(), displayTitle: m[1].trim() };
                    }
                  }
                  return b;
                })
              : undefined;

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

        const chunks = semanticChunker.chunkPreprocessedUnits(allUnits, bookEntity);
        const chunk_ms = Date.now() - t0Chunk;

        const words = res.totalWordCount != null
          ? res.totalWordCount
          : (Array.isArray(res.chapters) ? res.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0) : 0);

        const chaptersCount = Array.isArray(res.chapters) ? res.chapters.length : 0;
        const chunksCount = Array.isArray(chunks) ? chunks.length : 0;
        const fmt = (res.format || path.extname(filename).slice(1) || 'unknown').toLowerCase();

        fileRecord = {
          document: filename,
          format: fmt,
          bytes: sizeBytes,
          sizeFormatted: formatSize(sizeBytes),
          chapters: chaptersCount,
          words,
          chunks: chunksCount,
          parse_ms,
          chunk_ms,
          status: 'PASS',
          attempts,
        };

        success = true;
        console.log(`  ✓ PASS: ${chaptersCount} ch, ${words.toLocaleString()} words, ${chunksCount} chunks (Parse: ${parse_ms} ms, Chunk: ${chunk_ms} ms)`);
      } catch (err) {
        lastError = err;
        if (attempts < maxAttempts) {
          console.log(`  ⚠ [Attempt ${attempts}/${maxAttempts} Failed] ${err.message}. Retrying...`);
        }
      }
    }

    if (!success) {
      console.log(`  ✗ FAIL (after ${attempts} attempts): ${lastError ? lastError.message : 'Unknown error'}`);
      fileRecord = {
        document: filename,
        format: path.extname(filename).slice(1).toLowerCase() || 'unknown',
        bytes: sizeBytes,
        sizeFormatted: formatSize(sizeBytes),
        chapters: 0,
        words: 0,
        chunks: 0,
        parse_ms: 0,
        chunk_ms: 0,
        status: 'FAIL',
        attempts,
        error: lastError ? lastError.message : 'Unknown error',
      };
    }

    results.push(fileRecord);
  }

  // Calculate aggregates
  let totalBytes = 0;
  let totalChapters = 0;
  let totalWords = 0;
  let totalChunks = 0;
  let totalParseMs = 0;
  let totalChunkMs = 0;
  let passedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    totalBytes += r.bytes;
    if (r.status === 'PASS') {
      passedCount++;
      totalChapters += r.chapters;
      totalWords += r.words;
      totalChunks += r.chunks;
      totalParseMs += r.parse_ms;
      totalChunkMs += r.chunk_ms;
    } else {
      failedCount++;
    }
  }

  const avgBytes = Math.round(totalBytes / results.length);
  const avgChapters = passedCount > 0 ? (totalChapters / passedCount).toFixed(1) : 0;
  const avgWords = passedCount > 0 ? Math.round(totalWords / passedCount) : 0;
  const avgChunks = passedCount > 0 ? (totalChunks / passedCount).toFixed(1) : 0;
  const avgParseMs = passedCount > 0 ? (totalParseMs / passedCount).toFixed(1) : 0;
  const avgChunkMs = passedCount > 0 ? (totalChunkMs / passedCount).toFixed(1) : 0;

  const aggregate = {
    totals: {
      files: results.length,
      passed: passedCount,
      failed: failedCount,
      bytes: totalBytes,
      sizeFormatted: formatSize(totalBytes),
      chapters: totalChapters,
      words: totalWords,
      chunks: totalChunks,
      parse_ms: totalParseMs,
      chunk_ms: totalChunkMs,
    },
    averages: {
      bytes: avgBytes,
      sizeFormatted: formatSize(avgBytes),
      chapters: Number(avgChapters),
      words: avgWords,
      chunks: Number(avgChunks),
      parse_ms: Number(avgParseMs),
      chunk_ms: Number(avgChunkMs),
    },
  };

  // Build JSON output artifact
  const outputData = {
    _meta: {
      generated_at: new Date().toISOString(),
      source_directory: TARGET_DIR,
      total_files: results.length,
      passed_files: passedCount,
      failed_files: failedCount,
    },
    results,
    totals: aggregate.totals,
    averages: aggregate.averages,
  };

  fs.writeFileSync(RESULTS_JSON_PATH, JSON.stringify(outputData, null, 2), 'utf8');

  // Build Markdown table
  const lines = [];
  lines.push('\n================================================================');
  lines.push('📊 JUNCTURE BENCHMARK RESULTS');
  lines.push('================================================================\n');

  lines.push('| Document | Format | Size | Chapters | Words | Chunks | Parse (ms) | Chunk (ms) | Status |');
  lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

  for (const r of results) {
    const docName = r.document;
    const fmt = r.format.toUpperCase();
    const size = r.sizeFormatted;
    const ch = r.status === 'PASS' ? r.chapters.toLocaleString() : '-';
    const w = r.status === 'PASS' ? r.words.toLocaleString() : '-';
    const ck = r.status === 'PASS' ? r.chunks.toLocaleString() : '-';
    const pms = r.status === 'PASS' ? r.parse_ms.toLocaleString() : '-';
    const cms = r.status === 'PASS' ? r.chunk_ms.toLocaleString() : '-';
    const st = r.status === 'PASS' ? 'PASS' : `FAIL (${r.error || 'error'})`;
    lines.push(`| ${docName} | ${fmt} | ${size} | ${ch} | ${w} | ${ck} | ${pms} | ${cms} | ${st} |`);
  }

  // Aggregate rows
  lines.push(
    `| **TOTAL / AGGREGATE** | **ALL** | **${aggregate.totals.sizeFormatted}** | **${aggregate.totals.chapters.toLocaleString()}** | **${aggregate.totals.words.toLocaleString()}** | **${aggregate.totals.chunks.toLocaleString()}** | **${aggregate.totals.parse_ms.toLocaleString()}** | **${aggregate.totals.chunk_ms.toLocaleString()}** | **${passedCount}/${results.length} PASS** |`
  );
  lines.push(
    `| **AVERAGE PER FILE** | — | **${aggregate.averages.sizeFormatted}** | **${aggregate.averages.chapters}** | **${aggregate.averages.words.toLocaleString()}** | **${aggregate.averages.chunks}** | **${aggregate.averages.parse_ms}** | **${aggregate.averages.chunk_ms}** | — |`
  );

  const markdownTable = lines.join('\n');
  console.log(markdownTable);
  console.log(`\nMachine-readable benchmark results saved to: ${RESULTS_JSON_PATH}`);
}

runBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});

