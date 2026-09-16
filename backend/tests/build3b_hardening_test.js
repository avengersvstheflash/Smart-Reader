const assert = require('assert');
const documentStructureAnalyzer = require('../services/ingestion/structure/documentStructureAnalyzer');
const ingestionService = require('../services/ingestion/ingestionService');
const bookService = require('../services/bookService');
const app = require('../server');
const http = require('http');

async function runHardeningTests() {
  console.log('--- STARTING BUILD 3B.1.5 HARDENING & RELIABILITY TEST SUITE ---');

  // Test 1: Section Headings (1.1, 1.2) must not be treated as chapters in Web/Document ingestion
  console.log('\n[Test 1] Verifying that section headings (1.1, 1.2, etc.) are kept as sections, not chapters');
  const blocksWithSubsections = [
    { type: 'heading', level: 1, text: 'Chapter 1: Foundations of Computing' },
    { type: 'paragraph', text: 'Computing foundations span several fundamental models of calculation.' },
    { type: 'heading', level: 2, text: '1.1 Turing Machines and Computability' },
    { type: 'paragraph', text: 'A Turing machine consists of an infinite tape and a state register with transition rules.' },
    { type: 'heading', level: 2, text: '1.2 Lambda Calculus Equivalences' },
    { type: 'paragraph', text: 'Alonzo Church developed lambda calculus concurrently as a formal system for function definition.' },
    { type: 'heading', level: 2, text: '1.3 The Church-Turing Thesis' },
    { type: 'paragraph', text: 'The thesis states that any function that can be computed by an algorithm can be computed by a Turing machine.' },
    { type: 'heading', level: 1, text: 'Chapter 2: Computational Complexity' },
    { type: 'paragraph', text: 'Complexity theory classifies computational problems according to their resource usage.' },
    { type: 'heading', level: 2, text: '2.1 Deterministic Polynomial Time (P)' },
    { type: 'paragraph', text: 'The class P consists of all decision problems solvable in polynomial time by a deterministic Turing machine.' },
    { type: 'heading', level: 2, text: '2.2 Nondeterministic Polynomial Time (NP)' },
    { type: 'paragraph', text: 'The class NP comprises problems verifiable in polynomial time given a certificate.' }
  ];

  const analysis = documentStructureAnalyzer.analyzeTextOrMarkdownStructure(
    blocksWithSubsections,
    '',
    'markdown',
    { title: 'Foundations of Computer Science' }
  );

  assert.strictEqual(analysis.chapterCount, 2, `Expected exactly 2 chapters, but got ${analysis.chapterCount}`);
  assert.strictEqual(analysis.chapters[0].title, 'Chapter 1: Foundations of Computing');
  assert.strictEqual(analysis.chapters[1].title, 'Chapter 2: Computational Complexity');

  const ch1Sections = analysis.chapters[0].sections;
  assert.strictEqual(ch1Sections.length, 3, `Expected 3 sections in Chapter 1, got ${ch1Sections.length}`);
  assert.strictEqual(ch1Sections[0].title, '1.1 Turing Machines and Computability');
  assert.strictEqual(ch1Sections[1].title, '1.2 Lambda Calculus Equivalences');
  assert.strictEqual(ch1Sections[2].title, '1.3 The Church-Turing Thesis');

  const ch2Sections = analysis.chapters[1].sections;
  assert.strictEqual(ch2Sections.length, 2, `Expected 2 sections in Chapter 2, got ${ch2Sections.length}`);
  assert.strictEqual(ch2Sections[0].title, '2.1 Deterministic Polynomial Time (P)');
  console.log('✓ Section headings (1.1, 1.2) successfully preserved as sections inside parent chapters!');

  // Test 2: Web Structure Analyzer must also respect chapter boundaries and keep subheadings as sections
  console.log('\n[Test 2] Verifying Web Structure Analyzer sub-section handling');
  const webBlocks = [
    { type: 'heading', level: 1, text: 'Distributed Systems Handbook' },
    { type: 'paragraph', text: 'This handbook surveys modern principles of distributed computing.' },
    { type: 'heading', level: 2, text: 'Consensus Protocols' },
    { type: 'paragraph', text: 'Achieving agreement across independent nodes requires fault-tolerant consensus.' },
    { type: 'heading', level: 3, text: '1.1 Paxos vs Raft' },
    { type: 'paragraph', text: 'Paxos separates roles into proposers, acceptors, and learners.' },
    { type: 'heading', level: 3, text: '1.2 Byzantine Agreement' },
    { type: 'paragraph', text: 'Byzantine faults model malicious or arbitrary node failures.' },
    { type: 'heading', level: 2, text: 'Storage Architecture' },
    { type: 'paragraph', text: 'Distributed storage partitions data across nodes using consistent hashing.' }
  ];

  const webAnalysis = documentStructureAnalyzer.analyzeWebStructure(
    webBlocks,
    'Distributed Systems Handbook',
    'https://example.com/handbook'
  );

  assert.strictEqual(webAnalysis.chapterCount >= 2, true, 'Expected multiple chapters for major H2 topics');
  const consensusCh = webAnalysis.chapters.find(c => c.title.includes('Consensus Protocols'));
  assert.ok(consensusCh, 'Expected Consensus Protocols chapter');
  assert.ok(consensusCh.sections.some(s => s.title.includes('1.1 Paxos vs Raft')), '1.1 should be in sections of Consensus chapter');
  console.log('✓ Web ingestion accurately groups sections inside chapters without creating splinter chapters!');

  // Test 3: Empty Content Detection & Warning Flagging
  console.log('\n[Test 3] Verifying Empty Content & Scanned Document Warning Detection');
  const emptyAnalysis = documentStructureAnalyzer.analyzeTextOrMarkdownStructure([], '', 'text', { title: 'Empty Book' });
  assert.strictEqual(emptyAnalysis.integrityStatus, 'empty_content', 'Expected integrityStatus to be empty_content');
  assert.ok(emptyAnalysis.integrityWarning.length > 0, 'Expected non-empty integrityWarning message');
  console.log(`✓ Empty content correctly flagged: status="${emptyAnalysis.integrityStatus}", warning="${emptyAnalysis.integrityWarning}"`);

  // Test 4: API routing guarantees JSON responses for unhandled /api/* paths (NEVER HTML)
  console.log('\n[Test 4] Verifying that unhandled /api/* routes return valid JSON (no HTML leakage)');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const testApi404 = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/non-existent-endpoint-test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify({ test: 1 }));
    req.end();
  });

  assert.strictEqual(testApi404.statusCode, 404, 'Expected status 404 for unhandled API route');
  assert.ok(testApi404.headers['content-type'].includes('application/json'), 'Content-Type must be application/json');
  assert.doesNotThrow(() => {
    const parsed = JSON.parse(testApi404.body);
    assert.ok(parsed.error, 'Response must include error message');
  }, 'Response must be valid parseable JSON without HTML tags');
  console.log('✓ Unhandled /api routes guaranteed to return clean JSON errors, preventing "<!doctype" JSON syntax errors!');

  // Test 5: End-to-end Ingestion via BookService preserving integrity metadata
  console.log('\n[Test 5] Ingesting book via BookService with structural validation');
  const imported = await bookService.importBook({
    title: 'Hardening Reliability Reference',
    author: 'Smart Reader Engineering Team',
    description: 'A verified document with multiple chapters and nested subsections.',
    contentType: 'novel',
    text: `# Chapter 1: Reliability Guarantees\n\nHigh reliability systems withstand network disruptions and input variations.\n\n## 1.1 Fault Isolation\n\nComponents fail independently.\n\n## 1.2 Graceful Degradation\n\nDegraded modes preserve essential reading flows.\n\n# Chapter 2: Observability\n\nMetrics and traces identify anomalies before end-user disruption.`
  });

  assert.ok(imported.book, 'Book should be created');
  assert.strictEqual(imported.chapterCount, 2, 'Should create 2 distinct chapters');
  assert.strictEqual(imported.integrityStatus, 'valid', 'Integrity status should be valid');
  assert.strictEqual(imported.sectionCount >= 2, true, 'Subsections should be recorded in section count');
  console.log(`✓ Book created with id=${imported.book.id}, chapters=${imported.chapterCount}, sections=${imported.sectionCount}, integrity=${imported.integrityStatus}`);

  // Close the ephemeral test server. Note: requiring '../server' above also
  // started a listener on port 3000 as a side effect, which we can't close
  // from here. That's why the process must be explicitly terminated below.
  await new Promise(resolve => server.close(resolve));

  console.log('\n======================================================');
  console.log('🎉 ALL BUILD 3B.1.5 HARDENING TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================');
}

runHardeningTests()
  .then(() => {
    // Explicit exit: requiring '../server' starts a port-3000 listener
    // as a side effect, which prevents the event loop from draining.
    // 100ms gives stdout time to flush to the terminal.
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('\n❌ HARDENING TEST FAILED:', err);
    setTimeout(() => process.exit(1), 100);
  });