const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ingestionService = require('../services/ingestion/ingestionService');
const parseClient = require('../services/ai/parseClient');
const docxParser = require('../services/ingestion/parsers/docxParser');
const rtfParser = require('../services/ingestion/parsers/rtfParser');
const config = require('../config');

// Setup ephemeral mock server
let server;
let serverPort;
let lastRequestPath;
let mockResponseStatus = 200;
let mockResponseBody = { title: "Test", author: "Auth", blocks: [{kind: "paragraph", text: "Hello"}] };

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      lastRequestPath = req.url;
      res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockResponseBody));
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
  await startServer();
  let passed = 0;
  let failed = 0;
  
  function pass(name) { console.log(`[PASS] ${name}`); passed++; }
  function fail(name, err) { console.log(`[FAIL] ${name}
${err.stack || err}`); failed++; }

  try {
    // T1. detectFormat recognizes by magic bytes
    const pdfBuf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    assert.strictEqual(ingestionService.detectFormat('', '', pdfBuf), 'pdf');
    
    const docxBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    assert.strictEqual(ingestionService.detectFormat('', 'test.docx', docxBuf), 'docx');
    
    const rtfBuf = Buffer.from([0x7b, 0x5c, 0x72, 0x74, 0x66]);
    assert.strictEqual(ingestionService.detectFormat('', '', rtfBuf), 'rtf');
    pass('T1 detectFormat magic bytes');
  } catch (e) { fail('T1', e); }

  try {
    // T2. detectFormat unsupported_zip
    const docxBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    assert.strictEqual(ingestionService.detectFormat('', 'test.odt', docxBuf), 'unsupported_zip');
    pass('T2 unsupported_zip');
  } catch (e) { fail('T2', e); }

  try {
    // T3. parseClient.parseDocx()
    mockResponseStatus = 200;
    const res = await parseClient.parseDocx(Buffer.from([]), { baseUrl: `http://127.0.0.1:${serverPort}` });
    assert.strictEqual(res.title, 'Test');
    assert.strictEqual(lastRequestPath, '/v1/parse/docx');
    pass('T3 parseClient 200');
  } catch (e) { fail('T3', e); }

  try {
    // T4. sidecar down
    await parseClient.parseDocx(Buffer.from([]), { baseUrl: `http://127.0.0.1:1` })
      .then(() => assert.fail('Should throw'))
      .catch(e => assert.strictEqual(e.code, 'PARSE_SIDECAR_UNAVAILABLE'));
    pass('T4 sidecar down');
  } catch (e) { fail('T4', e); }

  try {
    // T5. mocked 400
    mockResponseStatus = 400;
    mockResponseBody = { detail: { message: "Invalid DOCX format" } };
    await parseClient.parseDocx(Buffer.from([]), { baseUrl: `http://127.0.0.1:${serverPort}` })
      .then(() => assert.fail('Should throw'))
      .catch(e => assert.strictEqual(e.code, 'INVALID_FORMAT'));
    pass('T5 mocked 400');
  } catch (e) { fail('T5', e); }

  try {
    // T6. docxParser.parse()
    mockResponseStatus = 200;
    mockResponseBody = { title: "T", author: "A", blocks: [{kind: "paragraph", text: "Hello there"}] };
    const res = await docxParser.parse(Buffer.from([]), { baseUrl: `http://127.0.0.1:${serverPort}` });
    assert(Array.isArray(res.chapters));
    assert.strictEqual(res.totalWordCount, 2);
    assert.strictEqual(res.integrityStatus, 'valid');
    pass('T6 docxParser.parse');
  } catch (e) { fail('T6', e); }

  try {
    // T7. rtfParser.parse()
    const res = await rtfParser.parse(Buffer.from([]), { baseUrl: `http://127.0.0.1:${serverPort}` });
    assert(Array.isArray(res.chapters));
    pass('T7 rtfParser.parse');
  } catch (e) { fail('T7', e); }

  try {
    // T8. USE_PYTHON_PARSER = false
    config.USE_PYTHON_PARSER = false;
    await ingestionService.ingest({ fileBuffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]), originalFilename: 'a.docx' })
      .then(() => assert.fail('Should throw'))
      .catch(e => assert.strictEqual(e.code, 'UNSUPPORTED_FORMAT'));
    config.USE_PYTHON_PARSER = true;
    pass('T8 USE_PYTHON_PARSER=false throws');
  } catch (e) { fail('T8', e); }

  try {
    // T9. unsupported_zip
    const zipBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await ingestionService.ingest({ fileBuffer: zipBuf, originalFilename: 'a.odt' })
      .then(() => assert.fail('Should throw'))
      .catch(e => assert.strictEqual(e.code, 'UNSUPPORTED_FORMAT'));
    pass('T9 unsupported_zip throws');
  } catch (e) { fail('T9', e); }

  await stopServer();
  console.log(`=== phase5_7_3_parse_test.js ===
Passed: ${passed}
Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests();
