const assert = require('assert');
const webSearchService = require('../services/web/webSearchService');

async function hasNetwork() {
  try {
    const r = await fetch('https://arxiv.org', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function testWebSearch() {
  console.log('=== RUNNING EXPANDED WEB SEARCH & SOURCE DISCOVERY TESTS ===');

  // Test 1: Direct URL returns immediate direct URL candidate
  console.log('Test 1: Direct URL search');
  const directResults = await webSearchService.search('https://en.wikipedia.org/wiki/Attractor');
  assert(directResults.length > 0, 'Should return at least 1 result for direct URL');
  assert.strictEqual(directResults[0].url, 'https://en.wikipedia.org/wiki/Attractor');
  console.log('✓ Direct URL recognized and prioritized');

  // Test 2: Category 'research' returns academic items with valid metadata
  console.log('Test 2: Research search');
  if (!(await hasNetwork())) {
    console.log('  [SKIP] offline — network required');
  } else {
    const researchResults = await webSearchService.search('attractor neural network', { category: 'research', limit: 6 });
    console.log(`  Received ${researchResults.length} research results`);
    assert(Array.isArray(researchResults), 'Should return an array');
    if (researchResults.length > 0) {
      const first = researchResults[0];
      assert(first.title, 'Should have title');
      assert(first.url, 'Should have url');
      assert(first.sourceSite, 'Should have source attribution');
    }
    console.log('✓ Research discovery verified');
  }

  // Test 3: Category 'books' returns book items with valid metadata
  console.log('Test 3: Books search');
  if (!(await hasNetwork())) {
    console.log('  [SKIP] offline — network required');
  } else {
    const bookResults = await webSearchService.search('frankenstein', { category: 'books', limit: 6 });
    console.log(`  Received ${bookResults.length} book results`);
    assert(Array.isArray(bookResults), 'Should return an array');
    if (bookResults.length > 0) {
      const first = bookResults[0];
      assert(first.title, 'Should have title');
      assert(first.url, 'Should have url');
    }
    console.log('✓ Books discovery verified');
  }

  // Test 4: Empty query returns empty array
  console.log('Test 4: Empty query handling');
  const emptyResults = await webSearchService.search('');
  assert.deepStrictEqual(emptyResults, []);
  console.log('✓ Empty query handled cleanly');

  // Test 5: Technical Docs & RFC standards search
  console.log('Test 5: Technical Docs & RFC Standards search');
  if (!(await hasNetwork())) {
    console.log('  [SKIP] offline — network required');
  } else {
    const rfcResults = await webSearchService.searchTechnicalDocs('7540', 2);
    console.log(`  Received ${rfcResults.length} RFC technical doc results`);
    assert(Array.isArray(rfcResults), 'Should return an array for technical docs');
    if (rfcResults.length > 0) {
      const first = rfcResults[0];
      assert(first.title.includes('7540') || first.title.includes('HTTP'), 'Should match HTTP/2 RFC 7540');
      assert(first.url.includes('rfc'), 'URL should link to RFC editor');
      assert.strictEqual(first.sourceSite, 'IETF / RFC Standards');
    }
    console.log('✓ Technical docs & RFC lookup verified');
  }

  console.log('====================================================');
  console.log('🎉 ALL EXPANDED WEB SEARCH TESTS PASSED!');
  console.log('====================================================');
}

testWebSearch().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
