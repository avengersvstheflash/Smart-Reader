const assert = require('assert');
const editorialPlanner = require('../services/synthesis/editorialPlanner');
const editorialService = require('../services/synthesis/editorialService');
const bookService = require('../services/bookService');
const semanticIndex = require('../services/semantic/semanticIndex');
const outlineRepository = require('../repositories/outlineRepository');

async function runTests() {
  console.log('🧪 Running Build 4.2a Content-Aware Editorial Planner Tests...\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Planner receives actual content excerpts (not just metadata)
  // Assert contentExcerpt length > 100 chars per section in candidateSections
  // ---------------------------------------------------------------------------
  console.log('Test 1: Planner receives actual content excerpts (not just metadata)');
  let capturedPrompt = '';
  const mockAI = {
    generateText: async (prompt) => {
      capturedPrompt = prompt;
      return {
        text: JSON.stringify({
          organizationStrategy: 'thematic',
          chapters: [
            {
              order: 1,
              title: 'Chapter 1: Foundational Theory',
              purpose: 'Introduction to foundational theory',
              sourceSectionIds: ['sec-1', 'sec-2'],
              targetWordCount: 2200,
              topics: ['foundations'],
            },
          ],
        }),
      };
    },
  };

  const candidateSectionsSubstantial = [
    {
      sectionId: 'sec-1',
      sectionTitle: 'Foundations of Distributed State Machines',
      sourceTitle: 'Distributed Systems Principles',
      contentType: 'research',
      wordCount: 1800,
      content: 'Distributed systems require fault-tolerant consensus mechanisms to maintain coherent state across nodes. In modern asynchronous networks, consensus cannot be guaranteed in the presence of unannounced node failures without partial synchrony assumptions. This chapter explores replicated state machines and the fundamental trade-offs between safety and liveness across partitioned networks.',
    },
    {
      sectionId: 'sec-2',
      sectionTitle: 'Consensus Protocols and Leader Election',
      sourceTitle: 'Consensus Engineering',
      contentType: 'research',
      wordCount: 2400,
      content: 'Leader election protocols provide deterministic ordering for transactional state machines under network latency. Paxos and Raft introduce structured terms to ensure that at most one valid leader can propose state transitions at any given epoch, thereby preventing split-brain anomalies.',
    },
  ];

  const planResult1 = await editorialPlanner.plan({
    contentType: 'research',
    candidateSections: candidateSectionsSubstantial,
    topic: 'Distributed Systems',
  }, { aiService: mockAI });

  assert.strictEqual(planResult1.status, 'success', 'Plan 1 should succeed');
  assert(capturedPrompt.includes('SUPPLIED CANDIDATE SOURCE SECTIONS WITH CONTENT EXCERPTS:'), 'Prompt must supply candidate sections with content excerpts');

  // Verify that candidate sections in the prompt have contentExcerpt with length > 100
  assert(capturedPrompt.includes('"contentExcerpt":'), 'Prompt must include contentExcerpt field');
  assert(capturedPrompt.includes('Distributed systems require fault-tolerant consensus mechanisms'), 'Prompt must contain actual prose text');

  // Check extracted excerpt directly
  const excerpt1 = editorialPlanner.extractContentExcerpt(candidateSectionsSubstantial[0]);
  const excerpt2 = editorialPlanner.extractContentExcerpt(candidateSectionsSubstantial[1]);
  assert(excerpt1.length > 100, `Expected excerpt1 length > 100, got ${excerpt1.length}`);
  assert(excerpt2.length > 100, `Expected excerpt2 length > 100, got ${excerpt2.length}`);
  console.log(`  ✓ Test 1 passed: candidate sections contain substantive prose excerpts (${excerpt1.length} and ${excerpt2.length} chars).\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Planner assigns targetWordCount between 1500 and 3000 for a substantial chapter
  // ---------------------------------------------------------------------------
  console.log('Test 2: Planner assigns targetWordCount between 1500 and 3000 for a substantial chapter');
  const sectionLookupSubstantial = new Map();
  candidateSectionsSubstantial.forEach((s) => sectionLookupSubstantial.set(s.sectionId, s));

  // sec-1 (1800 words) + sec-2 (2400 words) = 4200 words. At 0.4 ratio = 1680 words.
  const substantialBudget = editorialPlanner.computeChapterWordBudget(['sec-1', 'sec-2'], sectionLookupSubstantial);
  console.log(`  Substantial chapter budget computed: ${substantialBudget} words (from 4200 raw words)`);
  assert(substantialBudget >= 1500 && substantialBudget <= 3000, `Expected budget in [1500, 3000], got ${substantialBudget}`);

  // Also verify through plan output
  assert(planResult1.chapters[0].targetWordCount >= 1500 && planResult1.chapters[0].targetWordCount <= 3000,
    `Planned chapter targetWordCount should be clamped in [1500, 3000], got ${planResult1.chapters[0].targetWordCount}`);
  console.log('  ✓ Test 2 passed: Substantial chapter assigned appropriate targetWordCount.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Planner assigns a shorter targetWordCount for a thin chapter (< 500 words available)
  // ---------------------------------------------------------------------------
  console.log('Test 3: Planner assigns a shorter targetWordCount for a thin chapter (< 500 words available)');
  const thinSections = [
    {
      sectionId: 'thin-1',
      sectionTitle: 'Brief Note on Network Latency',
      sourceTitle: 'Lab Notes',
      contentType: 'notes',
      wordCount: 200,
      content: 'Network latency spikes during cross-datacenter replication may cause leader lease expirations.',
    },
  ];
  const thinLookup = new Map();
  thinSections.forEach((s) => thinLookup.set(s.sectionId, s));

  // 200 words * 0.4 = 80 words -> should clamp to minimum 400 words
  const thinBudget = editorialPlanner.computeChapterWordBudget(['thin-1'], thinLookup);
  console.log(`  Thin chapter budget computed: ${thinBudget} words (from 200 raw words)`);
  assert.strictEqual(thinBudget, 400, `Expected thin budget clamped to minimum 400 words, got ${thinBudget}`);

  // Medium-thin test: 2000 raw words * 0.4 = 800 words (between 400 and 1500)
  const medThinSections = [
    {
      sectionId: 'med-1',
      sectionTitle: 'Medium Subsection',
      sourceTitle: 'Article',
      contentType: 'general',
      wordCount: 2000,
      content: 'A moderately sized section covering protocols.',
    },
  ];
  const medThinLookup = new Map();
  medThinSections.forEach((s) => medThinLookup.set(s.sectionId, s));
  const medThinBudget = editorialPlanner.computeChapterWordBudget(['med-1'], medThinLookup);
  console.log(`  Medium-thin budget computed: ${medThinBudget} words (from 2000 raw words)`);
  assert(medThinBudget >= 400 && medThinBudget < 1500, `Expected medThinBudget in [400, 1500), got ${medThinBudget}`);
  console.log('  ✓ Test 3 passed: Thin chapter assigned shorter targetWordCount down to minimum 400 words.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Invalid sourceSectionIds in LLM output are discarded and logged
  // ---------------------------------------------------------------------------
  console.log('Test 4: Invalid sourceSectionIds in LLM output are discarded and logged');
  let loggedWarning = '';
  const testLogger = {
    warn: (msg) => {
      loggedWarning += msg + ' ';
    },
    log: () => {},
    error: () => {},
  };
  const plannerWithLogger = new (editorialPlanner.constructor)({ logger: testLogger });

  const mockAIWithHallucination = {
    generateText: async () => ({
      text: JSON.stringify({
        organizationStrategy: 'thematic',
        chapters: [
          {
            order: 1,
            title: 'Valid Chapter With Hallucinated Section',
            purpose: 'Testing section filtering',
            sourceSectionIds: ['sec-1', 'hallucinated-section-999', 'fake-id-xyz'],
            topics: ['validation'],
          },
        ],
      }),
    }),
  };

  const planResult4 = await plannerWithLogger.plan({
    contentType: 'research',
    candidateSections: candidateSectionsSubstantial,
    topic: 'Validation Test',
  }, { aiService: mockAIWithHallucination });

  assert.strictEqual(planResult4.status, 'success', 'Plan should succeed with valid sections preserved');
  assert.strictEqual(planResult4.chapters.length, 1, 'Should have 1 chapter');
  const chapter1 = planResult4.chapters[0];
  assert.deepStrictEqual(chapter1.sourceSectionIds, ['sec-1'], 'Only valid sec-1 must be retained');
  assert(loggedWarning.includes('hallucinated-section-999'), 'Logger must record discarded hallucinated section');
  assert(loggedWarning.includes('fake-id-xyz'), 'Logger must record discarded fake ID');
  console.log('  ✓ Test 4 passed: Hallucinated section IDs discarded and logged.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: LLM failure returns { status: 'failed' } — no deterministic fallback
  // ---------------------------------------------------------------------------
  console.log('Test 5: LLM failure returns { status: "failed" } — no deterministic fallback');
  const mockAIFailure = {
    generateText: async () => {
      throw new Error('AI quota exceeded or network timeout');
    },
  };

  const planResult5 = await editorialPlanner.plan({
    contentType: 'research',
    candidateSections: candidateSectionsSubstantial,
    topic: 'Failure Test',
  }, { aiService: mockAIFailure });

  assert.strictEqual(planResult5.status, 'failed', 'editorialPlanner.plan MUST return status: "failed" when AI throws');
  assert(planResult5.reason && planResult5.reason.includes('AI quota exceeded'), 'Failure reason must be reported');
  assert.strictEqual(planResult5.chapters, undefined, 'Must not return substitute chapters on AI failure in planner');

  // Invalid JSON response test
  const mockAIInvalidJSON = {
    generateText: async () => ({
      text: 'Sorry, I am unable to format as JSON.',
    }),
  };

  const planResult5b = await editorialPlanner.plan({
    contentType: 'research',
    candidateSections: candidateSectionsSubstantial,
    topic: 'Invalid JSON Test',
  }, { aiService: mockAIInvalidJSON });

  assert.strictEqual(planResult5b.status, 'failed', 'editorialPlanner.plan MUST return status: "failed" on invalid JSON');
  console.log('  ✓ Test 5 passed: AI failure and invalid JSON return { status: "failed" } without silent fallback.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Empty chapters (no valid sourceSectionIds) are discarded
  // ---------------------------------------------------------------------------
  console.log('Test 6: Empty chapters (no valid sourceSectionIds) are discarded');
  const mockAIEmptyChapter = {
    generateText: async () => ({
      text: JSON.stringify({
        organizationStrategy: 'thematic',
        chapters: [
          {
            order: 1,
            title: 'Ghost Chapter',
            purpose: 'Has no valid IDs at all',
            sourceSectionIds: ['completely-fake-id-1', 'completely-fake-id-2'],
            topics: ['ghost'],
          },
          {
            order: 2,
            title: 'Solid Chapter',
            purpose: 'Has valid ID',
            sourceSectionIds: ['sec-1'],
            topics: ['solid'],
          },
        ],
      }),
    }),
  };

  const planResult6 = await plannerWithLogger.plan({
    contentType: 'research',
    candidateSections: candidateSectionsSubstantial,
    topic: 'Empty Chapter Discard Test',
  }, { aiService: mockAIEmptyChapter });

  assert.strictEqual(planResult6.status, 'success', 'Plan should succeed');
  assert.strictEqual(planResult6.chapters.length, 1, 'Ghost chapter with no valid IDs must be discarded');
  assert.strictEqual(planResult6.chapters[0].title, 'Solid Chapter', 'Remaining chapter must be the solid one');
  console.log('  ✓ Test 6 passed: Empty chapters with zero valid source sections discarded.\n');

  // ---------------------------------------------------------------------------
  // TEST 7: Existing multi-source dossier produces a coherent outline (smoke test)
  // ---------------------------------------------------------------------------
  console.log('Test 7: Existing multi-source dossier produces a coherent outline (smoke test)');
  const books = bookService.getAllBooks();
  assert(books.length >= 2, 'Must have at least 2 books in database for smoke test');

  // Re-index test chunks to ensure coverage
  await semanticIndex.indexChunks(books[0].id, [
    {
      id: `smoke-b1-${Date.now()}`,
      chapterId: 'ch-smoke-1',
      chunkIndex: 0,
      textContent: 'High throughput distributed replication systems rely on pipelined consensus batches.',
      contentType: 'paragraph',
      sectionHeading: 'Batch Consensus',
    },
  ]);
  await semanticIndex.indexChunks(books[1].id, [
    {
      id: `smoke-b2-${Date.now()}`,
      chapterId: 'ch-smoke-2',
      chunkIndex: 0,
      textContent: 'Comparative evaluation demonstrates asynchronous latency overhead under distributed load.',
      contentType: 'paragraph',
      sectionHeading: 'Comparative Latency',
    },
  ]);

  const outline = await editorialService.generateOutline({
    bookIds: [books[0].id, books[1].id],
    topic: 'Distributed Systems & Latency Smoke Test',
    title: 'Editorial Smoke Test Outline',
    fast: true,
  });

  assert(outline, 'Outline must be generated');
  assert(Array.isArray(outline.chapters) && outline.chapters.length > 0, 'Outline must have chapters');

  for (const ch of outline.chapters) {
    assert(ch.chapterId, 'Chapter must have chapterId');
    assert(ch.title, 'Chapter must have title');
    assert(Array.isArray(ch.sourceSectionIds) && ch.sourceSectionIds.length > 0, 'Chapter must have valid sourceSectionIds');
    assert(typeof ch.targetWordCount === 'number' && ch.targetWordCount >= 400, 'Chapter must have targetWordCount >= 400');
  }

  console.log(`  Smoke test generated ${outline.chapters.length} chapters with target word counts: ${outline.chapters.map((c) => c.targetWordCount).join(', ')}`);
  console.log('  ✓ Test 7 passed: Multi-source outline smoke test succeeded.\n');

  console.log('🎉 ALL BUILD 4.2a PLANNER TESTS PASSED!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Build 4.2a Test Failed:', err);
    process.exit(1);
  });
