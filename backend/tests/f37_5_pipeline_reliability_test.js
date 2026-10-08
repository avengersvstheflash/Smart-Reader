const assert = require('assert');
const fs = require('fs');
const path = require('path');

const bookService = require('../services/bookService');
const semanticLifecycle = require('../services/semantic/semanticLifecycle');
const semanticIndex = require('../services/semantic/semanticIndex');
const embedClient = require('../services/ai/embedClient');
const ingestionService = require('../services/ingestion/ingestionService');
const sectionClassifier = require('../services/ai/sectionClassifier');

async function run() {
  console.log('T1: Pipeline halts on indexing failure');
  const bookServiceContent = fs.readFileSync(path.join(__dirname, '../services/bookService.js'), 'utf8');
  const catchBlockIdx = bookServiceContent.indexOf('semanticLifecycle.indexBook');
  const throwIdx = bookServiceContent.indexOf('throw err;', catchBlockIdx);
  assert.ok(throwIdx > -1, 'T1 failed: throw err; missing in bookService.js after indexBook');

  console.log('T2: All CPU-bound sidecar endpoints are sync');
  const nlpRoutes = fs.readFileSync(path.join(__dirname, '../../sidecars/python/nlp/routes.py'), 'utf8');
  assert.ok(nlpRoutes.includes('def nlp_split(') && !nlpRoutes.includes('async def nlp_split('));
  assert.ok(nlpRoutes.includes('def nlp_chunk(') && !nlpRoutes.includes('async def nlp_chunk('));
  assert.ok(nlpRoutes.includes('def nlp_slice(') && !nlpRoutes.includes('async def nlp_slice('));
  assert.ok(nlpRoutes.includes('def nlp_rerank(') && !nlpRoutes.includes('async def nlp_rerank('));
  
  const embedRoutes = fs.readFileSync(path.join(__dirname, '../../sidecars/python/embed/routes.py'), 'utf8');
  assert.ok(embedRoutes.includes('def embed_batch(') && !embedRoutes.includes('async def embed_batch('));

  console.log('T3 & T4: embedBatch calls waitForReady before fetch and timeout is 90s');
  const embedClientContent = fs.readFileSync(path.join(__dirname, '../services/ai/embedClient.js'), 'utf8');
  assert.ok(embedClientContent.includes('await waitForReady(targetUrl, 90000);'));
  assert.ok(embedClientContent.includes('config.PYTHON_SIDECAR_TIMEOUT_MS || 90000'));

  console.log('T5: Ingestion bubbles up sidecar_down');
  const origBuildSectionMapFast = sectionClassifier.buildSectionMapFast;
  sectionClassifier.buildSectionMapFast = async () => { throw new Error('Connection refused'); };
  
  try {
    await ingestionService.ingest({
      title: 'Test',
      fileBuffer: Buffer.from('%PDF-1.4 mock pdf'),
      format: 'pdf',
      originalFilename: 'test.pdf'
    });
    assert.fail('Should have thrown SIDECAR_UNAVAILABLE');
  } catch (err) {
    assert.strictEqual(err.code, 'SIDECAR_UNAVAILABLE');
  } finally {
    sectionClassifier.buildSectionMapFast = origBuildSectionMapFast;
  }

  console.log('T6: parse structure/docx/rtf endpoints use sync/threadpool');
  const parseRoutes = fs.readFileSync(path.join(__dirname, '../../sidecars/python/parse/routes.py'), 'utf8');
  assert.ok(parseRoutes.includes('def parse_structure_endpoint(') && !parseRoutes.includes('async def parse_structure_endpoint('));
  assert.ok(parseRoutes.includes('run_in_threadpool(_parse_docx_sync'));
  assert.ok(parseRoutes.includes('run_in_threadpool(_parse_rtf_sync'));

  const ocrRoutes = fs.readFileSync(path.join(__dirname, '../../sidecars/python/ocr/routes.py'), 'utf8');
  assert.ok(ocrRoutes.includes('run_in_threadpool(_ocr_pdf_sync'));

  console.log('ALL TESTS PASSED');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
