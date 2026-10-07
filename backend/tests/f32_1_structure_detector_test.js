/**
 * backend/tests/f32_1_structure_detector_test.js
 *
 * Test suite for F32.1: Python-based structure detection.
 * Verifies fast structure detection, sidecar down fallback,
 * and optional LLM consolidation feature flag.
 * Uses ephemeral mock HTTP server (no real Python sidecar process required).
 */

'use strict';

const http = require('http');
const assert = require('assert');
const { detectStructure } = require('../services/ai/structureDetector');
const { buildSectionMapFast } = require('../services/ai/sectionClassifier');

let server;
let serverPort;
let mockResponseStatus = 200;
let mockResponseBody = {};
let lastRequestBody = null;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          lastRequestBody = JSON.parse(body);
        } catch (_) {
          lastRequestBody = body;
        }
        res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResponseBody));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F32.1 STRUCTURE DETECTOR TEST SUITE');
  console.log('================================================================\n');

  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const dummyPdf = Buffer.from('%PDF-1.4 mock pdf binary stream');

  let passed = 0;
  let failed = 0;

  function pass(name) {
    console.log(`[PASS] ${name}`);
    passed++;
  }

  function fail(name, err) {
    console.log(`[FAIL] ${name}\n${err.stack || err}`);
    failed++;
  }

  // T1: detectStructure returns parsed dict on 200
  try {
    mockResponseStatus = 200;
    mockResponseBody = {
      has_embedded_toc: true,
      toc: [{ level: 1, title: 'Chapter 1 Introduction', page: 1 }],
      heading_candidates: [
        { page: 1, text: 'Chapter 1 Introduction', font_size: 24, is_heading: true },
      ],
      front_matter_page_range: [1, 2],
      back_matter_page_range: [100, 105],
      estimated_chapter_count: 1,
      method: 'toc',
      warnings: [],
    };

    const res = await detectStructure(dummyPdf, { baseUrl });
    assert.ok(res !== null, 'Expected res not to be null on 200');
    assert.strictEqual(res.hasEmbeddedToc, true, 'Expected hasEmbeddedToc: true');
    assert.strictEqual(res.method, 'toc', 'Expected method: toc');
    assert.strictEqual(res.toc.length, 1, 'Expected 1 toc item');
    assert.strictEqual(res.toc[0].title, 'Chapter 1 Introduction');
    assert.strictEqual(res.headingCandidates.length, 1, 'Expected 1 heading candidate');
    assert.strictEqual(res.headingCandidates[0].fontSize, 24, 'Expected fontSize: 24');
    assert.strictEqual(res.headingCandidates[0].isHeading, true, 'Expected isHeading: true');
    assert.deepStrictEqual(res.frontMatterPageRange, [1, 2]);
    assert.deepStrictEqual(res.backMatterPageRange, [100, 105]);
    assert.strictEqual(res.estimatedChapterCount, 1);
    pass('T1: detectStructure returns parsed dict on 200');
  } catch (err) {
    fail('T1: detectStructure returns parsed dict on 200', err);
  }

  // T2: detectStructure returns null on sidecar down
  try {
    const offlineUrl = 'http://127.0.0.1:59998';
    const res = await detectStructure(dummyPdf, { baseUrl: offlineUrl, timeoutMs: 1000 });
    assert.strictEqual(res, null, 'Expected detectStructure to return null on offline sidecar');
    pass('T2: detectStructure returns null on sidecar down');
  } catch (err) {
    fail('T2: detectStructure returns null on sidecar down', err);
  }

  // T3: buildSectionMapFast with hasEmbeddedToc=true -> method='toc'
  try {
    mockResponseStatus = 200;
    mockResponseBody = {
      has_embedded_toc: true,
      toc: [
        { level: 1, title: 'Introduction', page: 1 },
        { level: 1, title: 'Distributed Systems', page: 10 },
      ],
      heading_candidates: [
        { page: 10, text: 'Distributed Systems', font_size: 22, is_heading: true },
      ],
      front_matter_page_range: [1, 5],
      back_matter_page_range: null,
      estimated_chapter_count: 2,
      method: 'toc',
      warnings: [],
    };

    const res = await buildSectionMapFast(dummyPdf, { baseUrl });
    assert.strictEqual(res.method, 'toc');
    assert.strictEqual(res.hasEmbeddedToc, true);
    assert.strictEqual(res.llmConsolidated, false);
    assert.strictEqual(res.toc.length, 2);
    pass('T3: buildSectionMapFast with hasEmbeddedToc=true -> method=\'toc\'');
  } catch (err) {
    fail('T3: buildSectionMapFast with hasEmbeddedToc=true', err);
  }

  // T4: buildSectionMapFast with only heading candidates -> method='heuristic'
  try {
    mockResponseStatus = 200;
    mockResponseBody = {
      has_embedded_toc: false,
      toc: [],
      heading_candidates: [
        { page: 4, text: 'Chapter 2 Architecture', font_size: 20, is_heading: true },
      ],
      front_matter_page_range: [1, 3],
      back_matter_page_range: null,
      estimated_chapter_count: 1,
      method: 'heuristic',
      warnings: [],
    };

    const res = await buildSectionMapFast(dummyPdf, { baseUrl });
    assert.strictEqual(res.method, 'heuristic');
    assert.strictEqual(res.hasEmbeddedToc, false);
    assert.strictEqual(res.llmConsolidated, false);
    assert.strictEqual(res.headingCandidates.length, 1);
    pass('T4: buildSectionMapFast with only heading candidates -> method=\'heuristic\'');
  } catch (err) {
    fail('T4: buildSectionMapFast with only heading candidates', err);
  }

  // T5: LLM consolidation DISABLED by default (flag unset)
  try {
    delete process.env.ENABLE_SECTION_LLM_CONSOLIDATION;
    let llmCalled = false;
    const mockAiService = {
      generateText: async () => {
        llmCalled = true;
        return { text: '[]' };
      },
    };

    mockResponseStatus = 200;
    mockResponseBody = {
      has_embedded_toc: false,
      toc: [],
      heading_candidates: [
        { page: 1, text: 'Candidate 1', font_size: 20, is_heading: true },
        { page: 2, text: 'Candidate 2', font_size: 20, is_heading: true },
        { page: 3, text: 'Candidate 3', font_size: 20, is_heading: true },
        { page: 4, text: 'Candidate 4', font_size: 20, is_heading: true },
        { page: 5, text: 'Candidate 5', font_size: 20, is_heading: true },
        { page: 6, text: 'Candidate 6', font_size: 20, is_heading: true },
      ],
      front_matter_page_range: null,
      back_matter_page_range: null,
      estimated_chapter_count: 6,
      method: 'heuristic',
      warnings: [],
    };

    const res = await buildSectionMapFast(dummyPdf, { baseUrl, aiService: mockAiService });
    assert.strictEqual(llmCalled, false, 'Expected LLM NOT to be called when flag is unset');
    assert.strictEqual(res.llmConsolidated, false);
    pass('T5: LLM consolidation DISABLED by default (flag unset)');
  } catch (err) {
    fail('T5: LLM consolidation DISABLED by default', err);
  }

  // T6: LLM consolidation runs when ENABLE_SECTION_LLM_CONSOLIDATION=true
  try {
    process.env.ENABLE_SECTION_LLM_CONSOLIDATION = 'true';
    let llmCalled = false;
    const mockAiService = {
      generateText: async (_prompt, options) => {
        llmCalled = true;
        assert.strictEqual(options.reasoning?.enabled, false, 'Expected reasoning: { enabled: false }');
        return {
          text: JSON.stringify([
            { title: 'Chapter 1', page: 1 },
            { title: 'Chapter 2', page: 2 },
          ]),
        };
      },
    };

    const res = await buildSectionMapFast(dummyPdf, {
      baseUrl,
      aiService: mockAiService,
    });
    assert.strictEqual(llmCalled, true, 'Expected LLM to be called when flag is enabled');
    assert.strictEqual(res.llmConsolidated, true);
    assert.strictEqual(res.toc.length, 2, 'Expected consolidated TOC to have 2 chapters');

    // Also verify that explicit useLlmConsolidation: false disables it even when env is true
    let overrideLlmCalled = false;
    const overrideAiService = {
      generateText: async () => {
        overrideLlmCalled = true;
        return { text: '[]' };
      },
    };
    const overrideRes = await buildSectionMapFast(dummyPdf, {
      baseUrl,
      aiService: overrideAiService,
      useLlmConsolidation: false,
    });
    assert.strictEqual(overrideLlmCalled, false, 'Expected explicit false to override env var');
    assert.strictEqual(overrideRes.llmConsolidated, false);

    delete process.env.ENABLE_SECTION_LLM_CONSOLIDATION;
    pass('T6: LLM consolidation runs when ENABLE_SECTION_LLM_CONSOLIDATION=true (mock LLM returns chapter tree)');
  } catch (err) {
    delete process.env.ENABLE_SECTION_LLM_CONSOLIDATION;
    fail('T6: LLM consolidation runs when flag enabled', err);
  }

  // T7: Sidecar down -> returns method='none' (falls back)
  try {
    const offlineUrl = 'http://127.0.0.1:59998';
    const res = await buildSectionMapFast(dummyPdf, { baseUrl: offlineUrl, timeoutMs: 1000 });
    assert.strictEqual(res.method, 'none');
    assert.ok(res.warnings.includes('sidecar_down'), 'Expected warnings to include sidecar_down');
    assert.strictEqual(res.llmConsolidated, false);
    pass('T7: Sidecar down -> returns method=\'none\' (falls back)');
  } catch (err) {
    fail('T7: Sidecar down -> returns method=\'none\'', err);
  }

  // T8: Empty PDF -> handled gracefully
  try {
    const res1 = await buildSectionMapFast(Buffer.alloc(0), { baseUrl });
    assert.strictEqual(res1.method, 'none');
    assert.strictEqual(res1.hasEmbeddedToc, false);

    const res2 = await buildSectionMapFast(null, { baseUrl });
    assert.strictEqual(res2.method, 'none');
    assert.strictEqual(res2.hasEmbeddedToc, false);

    const detectRes = await detectStructure(null, { baseUrl });
    assert.strictEqual(detectRes.method, 'none');
    pass('T8: Empty PDF -> handled gracefully');
  } catch (err) {
    fail('T8: Empty PDF -> handled gracefully', err);
  }

  await stopServer();

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

