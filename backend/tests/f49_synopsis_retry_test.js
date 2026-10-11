'use strict';

const assert = require('assert');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const representationRepository = require('../repositories/representationRepository');
const intelligentSummarizer = require('../services/ai/intelligentSummarizer');
const synthesisService = require('../services/synthesis/synthesisService');
const aiRetryGuard = require('../services/ai/aiRetryGuard');
const aiService = require('../services/ai/aiService');

async function runF49Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING F49 SYNOPSIS RETRY & EMPTY-INPUT GUARD TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Test 1: Empty inputs — Pre-LLM guard skips LLM call and returns honest [PARTIAL]
  // --------------------------------------------------------------------------
  console.log('Test 1: Empty inputs (all four inputs only [Section: ...] or empty) skips LLM call');
  {
    const book = bookRepository.create({
      title: 'F49 Empty Inputs Test Book',
      author: 'Unknown',
      content_type: 'novel',
    });

    const ch1Id = `ch-f49-1-${Date.now()}`;
    const ch2Id = `ch-f49-2-${Date.now()}`;

    const ch1 = chapterRepository.create({
      id: ch1Id,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1',
      sequence: 1,
      content: '[Section: Chapter 1]',
    });

    const ch2 = chapterRepository.create({
      id: ch2Id,
      book_id: book.id,
      number: 2,
      title: 'Chapter 2',
      sequence: 2,
      content: '[Section: Chapter 2]',
    });

    const chunk1Id = `chk-f49-empty1-${Date.now()}`;
    const chunk2Id = `chk-f49-empty2-${Date.now()}`;

    semanticChunkRepository.insertBatch([
      {
        id: chunk1Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: '[Section: Chapter 1]',
        sectionHeading: 'Chapter 1',
        tokenCount: 4,
      },
      {
        id: chunk2Id,
        bookId: book.id,
        chapterId: ch2.id,
        sequence: 1,
        textContent: '[Section: Chapter 2]',
        sectionHeading: 'Chapter 2',
        tokenCount: 4,
      },
    ]);

    let aiCallCount = 0;
    const origGenerateText = aiService.generateText;
    aiService.generateText = async () => {
      aiCallCount++;
      return {
        text: 'Fabricated programming book description that should never be produced.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);

      assert.strictEqual(aiCallCount, 0, 'LLM must NOT be called when usable input words < 50');
      assert.strictEqual(
        result.synopsis,
        '[PARTIAL: inputs insufficient for full synopsis]',
        'Returned synopsis must be honest [PARTIAL] line'
      );
      assert.strictEqual(
        result.representation.content,
        '[PARTIAL: inputs insufficient for full synopsis]',
        'Saved representation content must be honest [PARTIAL] line'
      );
      assert.strictEqual(result.representation.metadata.fell_back, true, 'Metadata must indicate fallback');
      assert.ok(result.representation.metadata.usable_words < 50, 'Metadata must record < 50 usable words');
      assert.strictEqual(result.representation.metadata.fallback_reason, 'insufficient_inputs', 'Fallback reason must be insufficient_inputs');

      console.log('  ✓ Verified: LLM was NOT called (0 calls), honest [PARTIAL] returned, no retry attempt fired.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 2: Regression test — Real inputs (100+ words of prose) calls LLM and retries if below 180w
  // --------------------------------------------------------------------------
  console.log('Test 2: Real inputs (100+ words) calls LLM and retries when output < 180 words');
  {
    const book = bookRepository.create({
      title: 'F49 Real Inputs Test Book',
      author: 'Technical Author',
      content_type: 'technical',
    });

    const ch1Id = `ch-f49-real1-${Date.now()}`;
    const ch1 = chapterRepository.create({
      id: ch1Id,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1',
      sequence: 1,
      content: 'This chapter explores the foundational architecture of distributed systems in modern computing.',
    });

    const realProse1 = 'Distributed systems require explicit communication protocols to coordinate state changes across separate network nodes. ' +
      'Consensus algorithms like Paxos and Raft provide fault-tolerant agreement on ordered state transitions. ' +
      'Replication logs ensure durable writes across server instances before acknowledging client mutations. ' +
      'Failure detectors monitor node heartbeats to identify unresponsive participants and initiate leader re-election. ' +
      'Formal models ensure safety properties hold despite arbitrary network delays or node crashes. ' +
      'Secondary replication mechanisms synchronize standby replicas through incremental log streaming. ' +
      'Read consistency models determine whether client read operations observe linearizable state transitions. ' +
      'Network partitions activate quorum requirements to guarantee single-leader invariants across regional data centers.';

    const realProse2 = 'The closing architecture synthesizes formal correctness proofs with pragmatic operational deployments. ' +
      'System benchmarks establish empirical latency curves across varying replication topologies and geographic regions. ' +
      'Disaster recovery pipelines validate cold-standby promotion under simulated datacenter severance. ' +
      'End-to-end telemetry captures throughput bottlenecks across high-concurrency mutation workloads.';

    const chunk1Id = `chk-f49-real1-${Date.now()}`;
    const chunk2Id = `chk-f49-real2-${Date.now()}`;

    semanticChunkRepository.insertBatch([
      {
        id: chunk1Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: realProse1,
        sectionHeading: 'Chapter 1: Foundations',
        tokenCount: 120,
      },
      {
        id: chunk2Id,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 1,
        textContent: realProse2,
        sectionHeading: 'Chapter 1: Advanced Metrics',
        tokenCount: 90,
      },
    ]);

    let callAttempts = 0;
    const promptsReceived = [];
    const origGenerateText = aiService.generateText;

    const fullValidOutput = 'This volume provides an authoritative examination of distributed consensus protocols, replicated state machine architectures, and formal verification frameworks for resilient infrastructure. Across multiple rigorous sections, the material addresses both algorithmic correctness and practical production trade-offs, demonstrating how quorum systems survive arbitrary network partitions without data corruption.\n\n' +
      'The interior balances theoretical mathematical proofs with concrete telemetry models, guiding engineers through leader election invariants and log replication mechanics. The text reads like an experienced systems architect\'s rigorous technical manual — confident, comprehensive, and uncompromising. Across consecutive chapters, foundational concepts such as linearizable read paths, distributed lock managers, and write-ahead logging are presented with progressive clarity.\n\n' +
      'Specialized sections explore failure detectors, heartbeat intervals, and dynamic membership reconfigurations, allowing distributed clusters to safely evolve over time without stopping continuous mutation workloads. Practitioners gain actionable heuristics for sizing replication quorums, handling split-brain anomalies, and evaluating empirical tail latency bounds under concurrent database load. The architectural framework remains disciplined, robust, and empirically verified across both synchronous local networks and wide-area cloud environments, ensuring consistent operational guarantees, minimal performance overhead, and clear failure recovery strategies for production deployments. Overall, the work provides software architects and distributed systems engineers with the rigorous mental models necessary to design fault-tolerant systems that remain dependable under real-world operating conditions.';

    aiService.generateText = async (prompt) => {
      callAttempts++;
      promptsReceived.push(prompt);
      if (callAttempts === 1) {
        // Attempt 1: short output (under 180 words floor)
        return {
          text: 'This book explores distributed systems and consensus protocols for robust infrastructure. [PARTIAL: inputs insufficient for full synopsis]',
          finish_reason: 'stop',
        };
      }
      // Attempt 2: valid output satisfying [180, 320] bounds
      return {
        text: fullValidOutput,
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);

      assert.strictEqual(callAttempts, 2, 'LLM must be called twice (initial attempt + retry when < 180 words)');
      assert.ok(!promptsReceived[0].includes('What reading it feels like'), 'Generated prompt must not contain "What reading it feels like"');
      assert.ok(promptsReceived[0].includes('Core subject'), 'Generated prompt must contain "Core subject"');
      assert.ok(promptsReceived[0].includes('Scope'), 'Generated prompt must contain "Scope"');
      assert.ok(promptsReceived[0].includes('Structure'), 'Generated prompt must contain "Structure"');
      assert.ok(promptsReceived[0].includes('Every sentence must be verifiable from the provided inputs'), 'Generated prompt must contain verifiability rule');
      assert.ok(promptsReceived[1].includes('IMPORTANT CONSTRAINT CORRECTION'), 'Retry prompt must include constraint correction');
      assert.ok(result.representation.content.includes('authoritative examination of distributed consensus'), 'Result must be the successful retry output');
      assert.strictEqual(result.representation.metadata.fell_back, false, 'Should not have fallen back');
      assert.strictEqual(result.representation.metadata.word_count_violation, false, 'Word count violation should be resolved on retry');

      console.log('  ✓ Verified: LLM was called, retry fired on short draft (<180w), and valid 200w synopsis produced on retry.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 3: aiRetryGuard Part B skipRetry flag behavior
  // --------------------------------------------------------------------------
  console.log('Test 3: aiRetryGuard honors skipRetry: true on short output');
  {
    let attempts = 0;
    const guardRes = await aiRetryGuard.executeWithWordCountGuard({
      generateFn: async () => {
        attempts++;
        return { text: 'Short honest partial output consisting of only nine words.' };
      },
      prompt: 'Summarize',
      bounds: { targetWords: 250, hardFloor: 180, hardCeiling: 320 },
      maxRetries: 1,
      contextLabel: '[Test skipRetry]',
      structuralCheck: false,
      skipRetry: true,
    });

    assert.strictEqual(attempts, 1, 'When skipRetry is true, exactly 1 attempt must be made');
    assert.strictEqual(guardRes.retrySkipped, true, 'retrySkipped must be true');
    assert.strictEqual(guardRes.violation, true, 'violation should still be recorded');
    assert.strictEqual(guardRes.retried, false, 'retried must be false');
    assert.strictEqual(guardRes.text, 'Short honest partial output consisting of only nine words.');

    console.log('  ✓ Verified: skipRetry accepted attempt 1 output, skipped retry, marked retrySkipped=true.\n');
  }

  // --------------------------------------------------------------------------
  // Test 4: synthesisService.generateSynopsis delegation
  // --------------------------------------------------------------------------
  console.log('Test 4: synthesisService.generateSynopsis delegates to intelligentSummarizer');
  {
    const book = bookRepository.create({
      title: 'F49 SynthesisService Delegation Book',
      author: 'Author',
      content_type: 'novel',
    });

    const result = await synthesisService.generateSynopsis(book.id);
    assert.ok(result, 'synthesisService.generateSynopsis must return result');
    assert.strictEqual(result.synopsis, '[PARTIAL: inputs insufficient for full synopsis]');
    console.log('  ✓ Verified: synthesisService.generateSynopsis successfully routed and produced honest [PARTIAL].\n');
  }

  // --------------------------------------------------------------------------
  // Test 5: Regression test — Books with [Section: ...] headers produce usableWords >= 50
  // --------------------------------------------------------------------------
  console.log('Test 5: Books with [Section: ...] headers produce usableWords >= 50 and call LLM');
  {
    const book = bookRepository.create({
      title: 'F49 Section Markers With Real Prose Book',
      author: 'Gu Zhen Ren',
      content_type: 'novel',
    });

    const ch1 = chapterRepository.create({
      id: `ch-f49-sec1-${Date.now()}`,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1: The Beginning',
      sequence: 1,
      content: 'Prose',
    });

    const ch2 = chapterRepository.create({
      id: `ch-f49-sec2-${Date.now()}`,
      book_id: book.id,
      number: 2,
      title: 'Chapter 2: The Conclusion',
      sequence: 2,
      content: 'Prose',
    });

    const ch1Text = '[Section: Chapter 1: The Beginning]\n\n' +
      'Translator: Skyfarrow\n\n' +
      'Chapter 1 – The heart of a demon never has regret even in death\n\n' +
      'Fang Yuan quietly observed the surrounding cliffs as the cold mountain wind howled against the stones. ' +
      'Across three hundred years of relentless cultivation, every victory had demanded blood and calculation. ' +
      'The ancient factions believed they had cornered the demonic practitioner upon the highest summit of the mountain range, ' +
      'yet the mysterious Cicada dormant within his spiritual aperture pulsed with nascent temporal energy. ' +
      'Even in the face of certain doom, the ruthless scholar showed neither remorse nor hesitation. ' +
      'He stepped backward into the abyss with a calm smile, initiating the secret reincarnation technique.';

    const ch2Text = '[Section: Chapter 2: The Conclusion]\n\n' +
      'The final convergence of temporal currents unfolded across the vast southern plains. ' +
      'Generations of rival sects assembled their ultimate formations to contest the legacy left behind by the legendary master. ' +
      'Gu masters exchanged devastating elemental techniques beneath darkened storm clouds as the destiny of the entire continent hung in delicate balance.';

    semanticChunkRepository.insertBatch([
      {
        id: `chk-f49-sec1-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: ch1Text,
        sectionHeading: 'Chapter 1: The Beginning',
        tokenCount: 150,
      },
      {
        id: `chk-f49-sec2-${Date.now()}`,
        bookId: book.id,
        chapterId: ch2.id,
        sequence: 1,
        textContent: ch2Text,
        sectionHeading: 'Chapter 2: The Conclusion',
        tokenCount: 100,
      },
    ]);

    let aiCalled = false;
    const origGenerateText = aiService.generateText;
    aiService.generateText = async () => {
      aiCalled = true;
      return {
        text: 'This novel follows the ruthless demonic cultivator Fang Yuan as he manipulates ancient factions and temporal relics across a brutal cultivation world. The narrative establishes dark moral ambiguity and complex power dynamics from the opening summit confrontation through the decisive continent-wide clashes.\n\nThe interior develops systematic cultivation hierarchies, clan politics, and strategic warfare across interconnected regions. Each phase balances tactical maneuvering with detailed domain lore, exploring how survival and ambition demand total dedication without sentimentality. The volume concludes with expansive multi-sect engagements that redefine continental authority.\n\nOverall, the work functions as a disciplined dark fantasy epic examining ruthless pragmatism, strategic resource management, and unwavering pursuit of immortality against overwhelming societal opposition.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);

      assert.strictEqual(aiCalled, true, 'LLM MUST be called when substantive prose follows [Section: ...] headers');
      assert.ok(result.representation.metadata.usable_words >= 50, `Usable words must be >= 50, got ${result.representation.metadata.usable_words}`);
      assert.strictEqual(result.representation.metadata.fell_back, false, 'Must not fall back to [PARTIAL]');
      assert.ok(!result.synopsis.includes('[PARTIAL:'), 'Synopsis must be full AI synopsis');
      console.log(`  ✓ Verified: Books with [Section: ...] headers produce usable_words >= 50 (${result.representation.metadata.usable_words}w), LLM called, full synopsis produced.\n`);
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 6 (T6): F49a — Synopsis prompt template structure and verifiability rule
  // --------------------------------------------------------------------------
  console.log('Test 6: F49a synopsis prompt structure enforces pure description and verifiability');
  {
    const promptTemplate = intelligentSummarizer.buildSynopsisPrompt({
      prefaceText: 'Author preface sample.',
      tocText: 'Chapter 1: Intro',
      ch1FirstPara: 'First chapter sample.',
      lastChFirstPara: 'Last chapter sample.',
    });

    assert.ok(
      !promptTemplate.includes('What reading it feels like'),
      'Prompt must NOT contain subjective "What reading it feels like" section'
    );
    assert.ok(
      !promptTemplate.toLowerCase().includes("reads like a working engineer's notebook"),
      'Prompt must NOT contain "reads like" example'
    );
    assert.ok(
      promptTemplate.includes('Core subject'),
      'Prompt must contain "Core subject"'
    );
    assert.ok(
      promptTemplate.includes('Scope'),
      'Prompt must contain "Scope"'
    );
    assert.ok(
      promptTemplate.includes('Structure'),
      'Prompt must contain "Structure"'
    );
    assert.ok(
      promptTemplate.includes('Every sentence must be verifiable from the provided inputs'),
      'Prompt must contain the new verifiability rule'
    );
    assert.ok(
      promptTemplate.includes('Avoid evaluative language'),
      'Prompt must caution against evaluative language'
    );

    console.log('  ✓ Verified: Prompt excludes subjective "feels like" language, has exact 3-section structure, and enforces verifiability rule.\n');
  }

  // --------------------------------------------------------------------------
  // Test 7: Single-chapter works sample lastChChunk from the final chunk of that chapter/book
  // --------------------------------------------------------------------------
  console.log('Test 7: Single-chapter works sample lastChChunk from the final chunk of the book');
  {
    const book = bookRepository.create({
      title: 'F49 Single Chapter Novella',
      author: 'Solo Author',
      content_type: 'novel',
    });

    const ch1 = chapterRepository.create({
      id: `ch-f49-single-${Date.now()}`,
      book_id: book.id,
      number: 1,
      title: 'Sole Movement',
      sequence: 1,
      word_count: 500,
      structural_role: 'chapter',
      content: 'Prose',
    });

    semanticChunkRepository.insertBatch([
      {
        id: `chk-f49-s1-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: 'Opening movement begins with clear dawn over the rolling foothills of the northern range. The early morning mist rises steadily from damp grass along the winding path leading upward into the mountain pass. Travelers pause to inspect the trail markings left by previous caravans.',
        sectionHeading: 'Opening Movement',
        tokenCount: 60,
      },
      {
        id: `chk-f49-s2-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 1,
        textContent: 'Middle passage explores internal meditations on history and solitude across the high plateau.',
        sectionHeading: 'Middle Passage',
        tokenCount: 30,
      },
      {
        id: `chk-f49-s3-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 2,
        textContent: 'Concluding movement resolves into twilight shadows stretching across the quiet valley. The mountain peaks catch the final crimson rays of sunset before darkness envelops the rocky ridge. The long expedition reaches its peaceful conclusion beneath the emergence of evening constellations.',
        sectionHeading: 'Concluding Movement',
        tokenCount: 60,
      },
    ]);

    let capturedPrompt = '';
    const origGenerateText = aiService.generateText;
    aiService.generateText = async (prompt) => {
      capturedPrompt = prompt;
      return {
        text: 'This single-movement novella charts the quiet journey across a remote northern valley from dawn until twilight shadows fall across the peaks. The narrative develops focused thematic impressions through deliberate pacing and introspective landscape descriptions.\n\nThe work balances geographical immersion with contemplative interior monologues, capturing the transitions between morning clarity and evening solitude without dramatic embellishment. Each section functions as a linked meditation on solitude and environmental permanence.\n\nOverall, the composition delivers a disciplined, evocative literary portrait that rewards patient contemplation with resonant imagery and understated emotional depth.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);
      assert.ok(capturedPrompt.includes('Opening movement begins with clear dawn'), 'Prompt must include first chunk prose');
      assert.ok(capturedPrompt.includes('Concluding movement resolves into twilight shadows'), 'Prompt must sample final chunk as last chapter opening');
      console.log('  ✓ Verified: Single-chapter book sampled final chunk as lastChChunk for comprehensive framing.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 8: TOC fallback when no chunk matches TOC regex
  // --------------------------------------------------------------------------
  console.log('Test 8: TOC falls back to outlineRepository or bodyChapters structure');
  {
    const book = bookRepository.create({
      title: 'F49 TOC Fallback Book',
      author: 'Outline Author',
      content_type: 'technical',
    });

    const outlineRepo = require('../repositories/outlineRepository');
    outlineRepo.saveOutline({
      outlineId: `book-editorial-${book.id}`,
      collectionId: book.id,
      title: 'Editorial Structure',
      chapters: [
        { chapterId: 'c1', title: 'Part I: Foundational Dynamics' },
        { chapterId: 'c2', title: 'Part II: Scaling Invariants' },
      ],
    });

    const ch1 = chapterRepository.create({
      id: `ch-f49-toc1-${Date.now()}`,
      book_id: book.id,
      number: 1,
      title: 'Foundational Dynamics',
      sequence: 1,
      word_count: 300,
      content: 'Prose',
    });

    semanticChunkRepository.insertBatch([
      {
        id: `chk-f49-toc1-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: 'Algorithmic architectures require formal verification to guarantee progress under asynchronous failure models. Systems engineers formulate safety and liveness invariants through structured state diagrams, ensuring that concurrent processes synchronize without introducing deadlock conditions across distributed cluster boundaries. Replication quorums guarantee atomic commits.',
        sectionHeading: 'Foundational Dynamics',
        tokenCount: 90,
      },
    ]);

    let capturedPrompt = '';
    const origGenerateText = aiService.generateText;
    aiService.generateText = async (prompt) => {
      capturedPrompt = prompt;
      return {
        text: 'This volume analyzes distributed architectures and formal verification techniques for large-scale systems. The text establishes mathematical rigor and operational models from initial state diagrams to production scaling invariants.\n\nThe material proceeds through consecutive analytical frameworks, detailing how consensus protocols balance latency overhead with strict linearizability. Engineers evaluate failure domains and state machine boundaries with concrete proofs.\n\nIn summary, the text provides a comprehensive and dependable reference manual for software architects designing resilient distributed infrastructure.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);
      assert.ok(capturedPrompt.includes('1. Part I: Foundational Dynamics'), 'Prompt TOC must contain outline chapters');
      assert.ok(capturedPrompt.includes('2. Part II: Scaling Invariants'), 'Prompt TOC must contain outline chapters');
      console.log('  ✓ Verified: TOC fallback correctly populated outline structure instead of "(None provided)".\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 9: Heading-only first chunk does not starve opening prose
  // --------------------------------------------------------------------------
  console.log('Test 9: Heading-only chunk 0 does not starve chapter opening prose');
  {
    const book = bookRepository.create({
      title: 'F49 Heading-Only Chunk Regression Book',
      author: 'Robustness Author',
      content_type: 'novel',
    });

    const ch1 = chapterRepository.create({
      id: `ch-f49-hdr1-${Date.now()}`,
      book_id: book.id,
      number: 1,
      title: 'Chapter 1: The Ascent',
      sequence: 1,
      word_count: 200,
      content: 'Prose',
    });

    const ch2 = chapterRepository.create({
      id: `ch-f49-hdr2-${Date.now()}`,
      book_id: book.id,
      number: 2,
      title: 'Chapter 2: The Summit',
      sequence: 2,
      word_count: 200,
      content: 'Prose',
    });

    semanticChunkRepository.insertBatch([
      {
        id: `chk-f49-hdr1-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 0,
        textContent: '[Section: Chapter 1: The Ascent]',
        tokenCount: 4,
      },
      {
        id: `chk-f49-hdr2-${Date.now()}`,
        bookId: book.id,
        chapterId: ch1.id,
        sequence: 1,
        textContent: 'The ascent begins under early twilight as cold mountain winds sweep across the high scree. Seasoned mountaineers check their rope harnesses and crampons before stepping onto the glaciated eastern face. Each step requires deliberate balance against the steep angle of the icy slope.',
        tokenCount: 50,
      },
      {
        id: `chk-f49-hdr3-${Date.now()}`,
        bookId: book.id,
        chapterId: ch2.id,
        sequence: 2,
        textContent: '[Section: Chapter 2: The Summit]',
        tokenCount: 4,
      },
      {
        id: `chk-f49-hdr4-${Date.now()}`,
        bookId: book.id,
        chapterId: ch2.id,
        sequence: 3,
        textContent: 'The summit ridge unfolds beneath blinding midday sun as the climbers reach the final rocky cornices. From this elevation, the entire northern range extends outward toward distant horizon horizons in stark relief against clear azure skies.',
        tokenCount: 50,
      },
    ]);

    let capturedPrompt = '';
    let aiCalled = false;
    const origGenerateText = aiService.generateText;
    aiService.generateText = async (prompt) => {
      capturedPrompt = prompt;
      aiCalled = true;
      return {
        text: 'This alpine expedition narrative follows mountaineers ascending a glaciated peak from early twilight through the final summit ridge. The account delivers meticulous technical descriptions of route-finding, equipment handling, and physical endurance across steep mountain terrain.\n\nThe progression unfolds from lower scree approaches into dangerous ice fields before concluding upon the highest cornices. Each section balances factual environmental detail with steady observational prose, avoiding sensational melodrama in favor of authentic mountaineering practice.\n\nOverall, the work stands as an engaging and disciplined chronicle of high-altitude adventure that captures both the physical rigor and solemn quiet of severe mountain wilderness.',
        finish_reason: 'stop',
      };
    };

    try {
      const result = await intelligentSummarizer.generateSynopsis(book.id);
      assert.strictEqual(aiCalled, true, 'LLM must be called when substantive prose is in subsequent chunks');
      assert.strictEqual(result.representation.metadata.fell_back, false, 'Must not fall back to [PARTIAL]');
      assert.ok(capturedPrompt.includes('The ascent begins under early twilight'), 'Must extract real prose from chunk 1');
      assert.ok(capturedPrompt.includes('The summit ridge unfolds beneath blinding midday sun'), 'Must extract real prose from chunk 3');
      console.log('  ✓ Verified: Heading-only first chunk did not starve opening prose; subsequent chunk prose extracted.\n');
    } finally {
      aiService.generateText = origGenerateText;
    }
  }

  // --------------------------------------------------------------------------
  // Test 10: Mixed CJK + Latin text with whitespace does not get over-truncated
  // --------------------------------------------------------------------------
  console.log('Test 10: Mixed CJK + whitespace truncation preserves substantive prose and word count');
  {
    const mixedText = 'Chapter 1 ' + '这是一段非常长的中文正文，讲述了一个古老门派在群山之巅的传奇故事，修仙者历经磨难不断追求大道的历程。'.repeat(10);
    const originalWords = require('../utils/wordCount').countWords(mixedText);
    assert.ok(originalWords > 100, `Original words must be > 100, got ${originalWords}`);

    const truncated = intelligentSummarizer.truncateToWordLimit(mixedText, 50);
    const truncatedWords = require('../utils/wordCount').countWords(truncated);
    assert.ok(truncatedWords >= 35 && truncatedWords <= 55, `Truncated words must be close to 50, got ${truncatedWords}`);
    assert.ok(truncated.includes('这是一段非常长的中文正文'), 'Must retain substantial CJK prose instead of discarding entire text after first space');
    console.log(`  ✓ Verified: Mixed CJK text properly truncated to ${truncatedWords} words without dropping prose.\n`);
  }

  console.log('================================================================');
  console.log('🎉 ALL F49 SYNOPSIS RETRY & EXTRACTION TESTS PASSED (10 tests)');
  console.log('================================================================');
}

runF49Tests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ F49 test run failed:', err);
    process.exit(1);
  });
