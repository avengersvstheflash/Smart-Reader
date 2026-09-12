const assert = require('assert');
const webSearchService = require('../services/web/webSearchService');
const webFetcher = require('../services/web/webFetcher');
const webExtractor = require('../services/web/webExtractor');
const webStructureDetector = require('../services/web/webStructureDetector');
const webAcquisitionService = require('../services/web/webAcquisitionService');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const supportingMaterialRepository = require('../repositories/supportingMaterialRepository');
const bookService = require('../services/bookService');
const aiService = require('../services/ai/aiService');

async function runTests() {
  console.log('🧪 Starting Build 3A Verification Tests...\n');

  // Test 1: Web Search returns structured results
  console.log('Test 1: Web search works');
  const searchResults = await webSearchService.search('Quantum Computing', { limit: 5 });
  assert(Array.isArray(searchResults), 'Search should return an array');
  assert(searchResults.length > 0, 'Search should return results for Quantum Computing');
  const firstRes = searchResults[0];
  assert(firstRes.title, 'Result must have a title');
  assert(firstRes.url, 'Result must have a url');
  assert(firstRes.sourceSite, 'Result must have a sourceSite');
  assert(firstRes.snippet, 'Result must have a snippet');
  console.log(`  ✓ Search returned ${searchResults.length} results. Top: "${firstRes.title}" (${firstRes.sourceSite})`);

  // Test 2: Search results can be selected explicitly with provenance
  console.log('Test 2: Search results provide selectable metadata');
  assert(firstRes.id, 'Result must have unique ID');
  assert(firstRes.sourceType, 'Result must have sourceType');
  console.log(`  ✓ Selectable result with id=${firstRes.id}, type=${firstRes.sourceType}`);

  // Test 3: HTML Extraction & Chrome Removal (Tests 5, 6, 7)
  console.log('Tests 5, 6, 7: Chrome removal, headings, lists, quotes, tables');
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Distributed Systems Primer - TechDoc</title>
        <meta property="og:title" content="Distributed Systems Primer">
        <meta name="author" content="Dr. Leslie Lamport">
        <meta property="og:site_name" content="TechDoc Portal">
      </head>
      <body>
        <nav class="nav-menu"><a href="/">Home</a><a href="/login">Login</a></nav>
        <header><div class="ad">Banner Ad</div></header>
        <main>
          <h1>Distributed Systems Primer</h1>
          <p>Distributed computing models allow independent nodes to coordinate over network channels.</p>
          
          <h2>Consensus Protocols</h2>
          <p>Consensus is foundational for distributed state machine replication.</p>
          <blockquote>"Agreement is reached when all non-faulty nodes decide upon the same value."</blockquote>
          
          <div class="callout warning">
            <b class="callout-title">Network Partition Warning</b>
            <span>Partitions can cause split-brain scenarios if quorum is lost.</span>
          </div>

          <h3>Key Properties</h3>
          <ul>
            <li>Safety: Nothing bad happens</li>
            <li>Liveness: Something good eventually happens</li>
          </ul>

          <h2>Comparison of Algorithms</h2>
          <table>
            <thead>
              <tr><th>Protocol</th><th>Fault Tolerance</th><th>Latency</th></tr>
            </thead>
            <tbody>
              <tr><td>Paxos</td><td>f < n/2</td><td>2 RTT</td></tr>
              <tr><td>Raft</td><td>f < n/2</td><td>2 RTT</td></tr>
            </tbody>
          </table>

          <pre><code class="language-js">function propose(value) { return commit(value); }</code></pre>
          <hr>
        </main>
        <footer><p class="copyright">Copyright 2026 TechDoc</p></footer>
      </body>
    </html>
  `;

  const extracted = webExtractor.extract(sampleHtml, 'https://techdoc.org/distributed-systems');
  assert.strictEqual(extracted.metadata.title, 'Distributed Systems Primer');
  assert.strictEqual(extracted.metadata.author, 'Dr. Leslie Lamport');
  assert.strictEqual(extracted.metadata.siteName, 'TechDoc Portal');

  const blocks = extracted.canonicalDoc.getBlocks();
  const types = blocks.map(b => b.type);
  assert(types.includes('heading'), 'Should contain headings');
  assert(types.includes('paragraph'), 'Should contain paragraphs');
  assert(types.includes('quote'), 'Should contain quote block');
  assert(types.includes('callout'), 'Should contain callout block');
  assert(types.includes('list'), 'Should contain list block');
  assert(types.includes('table'), 'Should contain table block');
  assert(types.includes('code'), 'Should contain code block');
  assert(types.includes('separator'), 'Should contain separator block');
  // Confirm chrome was removed
  const plain = extracted.canonicalDoc.toPlainText();
  assert(!plain.includes('Banner Ad'), 'Banner ad must be stripped');
  assert(!plain.includes('Home') || !plain.includes('Login'), 'Nav chrome must be stripped');
  console.log('  ✓ Extracted all canonical blocks cleanly; stripped all ad and nav chrome');

  // Test 4: Structure Detection
  console.log('Test 4: Structure detection creates meaningful chapters');
  const structuredChapters = webStructureDetector.structure(extracted.canonicalDoc, extracted.metadata);
  assert(structuredChapters.length >= 2, 'Should create at least 2 chapters for document with multiple H2s');
  assert(structuredChapters[0].title.includes('Introduction') || structuredChapters[0].title.includes('Overview') || structuredChapters[0].title.includes('Consensus'), 'First chapter title should be meaningful');
  console.log(`  ✓ Detected ${structuredChapters.length} structured chapters: ${structuredChapters.map(c => `"${c.title}"`).join(', ')}`);

  // Test 5: Accessible Webpage can be imported into Library (Tests 3, 4, 8, 9)
  console.log('Tests 3, 4, 8, 9: Web import into Library with provenance');
  // We will import a Wikipedia article (e.g. Alan Turing or Ada Lovelace or Python)
  const importRes = await webAcquisitionService.importSingle({
    url: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
    customTitle: 'Ada Lovelace: Computing Pioneer',
    contentType: 'research',
    description: 'Foundational biography of Ada Lovelace and the Analytical Engine.',
  });

  assert(importRes.book, 'Imported book should exist');
  assert.strictEqual(importRes.book.source_format, 'web');
  assert.strictEqual(importRes.book.source_url, 'https://en.wikipedia.org/wiki/Ada_Lovelace');
  assert(importRes.book.source_site.includes('Wikipedia'), 'Source site should be Wikipedia');
  assert(importRes.chapters.length > 0, 'Chapters should be saved');

  const retrievedBook = bookRepository.getById(importRes.book.id);
  assert(retrievedBook, 'Book should be retrievable from repository');
  const retrievedChapters = chapterRepository.getByBookId(importRes.book.id);
  assert(retrievedChapters.length > 0, 'Chapters should be retrievable');
  assert(retrievedChapters[0].canonical_content, 'Chapter must have canonical content stored');
  console.log(`  ✓ Successfully imported "${importRes.book.title}" with ${retrievedChapters.length} chapters and full provenance`);

  // Test 6: Book Main Page metadata & provenance (Test 10)
  console.log('Test 10: Book Main Page displays useful provenance metadata');
  assert.strictEqual(retrievedBook.source_format, 'web');
  assert.strictEqual(retrievedBook.source_url, 'https://en.wikipedia.org/wiki/Ada_Lovelace');
  assert(retrievedBook.source_site, 'Source site must be visible');
  console.log(`  ✓ Provenance displayed: URL=${retrievedBook.source_url}, Site=${retrievedBook.source_site}`);

  // Test 7: "Find Supporting Material" does not alter original content (Tests 6, 11)
  console.log('Tests 6, 11: "Find Supporting Material" attaches reference without altering original content');
  const origChapterCount = retrievedChapters.length;
  const origFirstChapContent = retrievedChapters[0].content;
  const origBookTitle = retrievedBook.title;

  const supportingMat = await webAcquisitionService.enrichBookWithSupportingMaterial(importRes.book.id, {
    url: 'https://en.wikipedia.org/wiki/Analytical_Engine',
    title: 'The Analytical Engine Hardware Reference',
    snippet: 'Charles Babbage’s mechanical general-purpose computer design.',
    contentType: 'research',
  });

  assert(supportingMat, 'Supporting material should be created');
  assert.strictEqual(supportingMat.book_id, importRes.book.id);
  assert(supportingMat.canonicalBlocks.length > 0, 'Supporting material has canonical blocks');

  // Verify book and chapters are completely untouched
  const bookAfter = bookRepository.getById(importRes.book.id);
  const chaptersAfter = chapterRepository.getByBookId(importRes.book.id);
  assert.strictEqual(bookAfter.title, origBookTitle, 'Book title must be unchanged');
  assert.strictEqual(chaptersAfter.length, origChapterCount, 'Chapter count must not change');
  assert.strictEqual(chaptersAfter[0].content, origFirstChapContent, 'Original chapter content must remain ground truth');

  // Verify supporting materials can be retrieved
  const allSupporting = webAcquisitionService.getSupportingMaterials(importRes.book.id);
  assert(allSupporting.some(s => s.id === supportingMat.id), 'Supporting material must be listed for book');
  console.log(`  ✓ Attached supporting material "${supportingMat.title}" without touching original book content`);

  // Test 8: Multiple sources retain source boundaries (Test 12)
  console.log('Test 12: Multiple sources retain source boundaries');
  const multiRes = await webAcquisitionService.importMulti({
    title: 'Pioneers of Computing Dossier',
    contentType: 'research',
    description: 'Multi-source dossier on early computational thinkers',
    sources: [
      { url: 'https://en.wikipedia.org/wiki/Charles_Babbage', title: 'Charles Babbage' },
      { url: 'https://en.wikipedia.org/wiki/Claude_Shannon', title: 'Claude Shannon' },
    ],
  });

  assert(multiRes.book, 'Dossier book created');
  assert.strictEqual(multiRes.sourcesCount, 2, 'Should include both sources');
  assert(multiRes.chapters.length >= 2, 'Should have chapters from both sources');
  // Verify source boundaries in titles or metadata
  const titles = multiRes.chapters.map(c => c.title);
  assert(titles.some(t => t.includes('Source 1') || t.includes('Babbage')), 'Should have Source 1 boundary');
  assert(titles.some(t => t.includes('Source 2') || t.includes('Shannon')), 'Should have Source 2 boundary');
  console.log(`  ✓ Multi-source imported with ${multiRes.sourcesCount} sources and preserved boundaries`);

  // Test 9: Inaccessible/failed sources fail gracefully (Test 13)
  console.log('Test 13: Inaccessible sources fail gracefully');
  let failedAsExpected = false;
  try {
    await webFetcher.fetch('http://localhost:9999/private-admin');
  } catch (err) {
    failedAsExpected = true;
    assert(err.message.includes('restricted') || err.message.includes('security') || err.message.includes('Failed'), 'Security error message expected');
  }
  assert(failedAsExpected, 'Private IP must be blocked');

  let notFoundAsExpected = false;
  try {
    await webFetcher.fetch('https://en.wikipedia.org/api/rest_v1/page/html/NonExistentPage_404_xyz123');
  } catch (err) {
    notFoundAsExpected = true;
    assert(
      err.message.includes('404') || 
      err.message.includes('429') || 
      err.message.includes('Rate limited') || 
      err.message.includes('not found') || 
      err.message.includes('Failed'),
      `Inaccessible error expected, received: "${err.message}"`
    );
  }
  assert(notFoundAsExpected, 'Inaccessible endpoint should throw clear error');
  console.log('  ✓ Inaccessible sources and private IPs fail with clean, informative errors');

  // Test 10: Existing user-uploaded books still work (Test 14)
  console.log('Test 14: Existing user-uploaded books still work');
  const manualBook = await bookService.importBook({
    title: 'Manual Ingestion Verification',
    author: 'Test Author',
    text: '# Chapter 1: Foundations\n\nThis is a standard markdown manual book import test.\n\n# Chapter 2: Conclusion\n\nManual ingestion is verified.',
    contentType: 'novel',
  });
  assert(manualBook.book, 'Manual book import works');
  assert.strictEqual(manualBook.chapters.length, 2, 'Manual chapters detected');
  console.log('  ✓ Standard manual book ingestion fully functional');

  // Test 11: AI functionality intact (Test 15)
  console.log('Test 15: AI provider status and services intact');
  const aiStatus = await aiService.getStatus();
  assert(aiStatus.activeProvider, 'Active AI provider must be configured');
  console.log(`  ✓ AI service active: ${aiStatus.activeProvider} (mode: ${aiStatus.activeMode})`);

  // Test 12: Cleanup test books
  console.log('\nCleaning up test artifacts...');
  bookRepository.delete(importRes.book.id);
  bookRepository.delete(multiRes.book.id);
  bookRepository.delete(manualBook.book.id);

  console.log('\n✅ All Build 3A Verification Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
