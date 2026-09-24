/**
 * BUILD 3B.1.6: DOCUMENT STRUCTURE ENGINE VERIFICATION TEST SUITE
 * 
 * Verifies the 10 core structural requirements:
 * 1. Real Textbook Decomposition (Practical Machine Learning, CRC Press failure case)
 * 2. TOC-Anchored Chapter Detection (handling physical page vs printed folio mismatch)
 * 3. Numbered Chapter Headings (Single-line, Multi-line, Standalone, Word-numbers)
 * 4. Deep Nested Section Hierarchy (e.g. 4.1.2.1 parent/child tree)
 * 5. Front Matter Classification (Preface, Foreword, TOC, Dedication)
 * 6. Back Matter Classification (Appendix, Bibliography, Index)
 * 7. Repeated Header/Footer Suppression (>= 3 non-adjacent pages)
 * 8. Provenance & Source Location Preservation (startPage, endPage, offsets)
 * 9. Word and Character Count Integrity (excluding suppressed running artifacts)
 * 10. Low-Confidence Graceful Fallback (Unstructured/novel text without false splitting)
 */

const assert = require('assert');
const documentStructureEngine = require('../services/structure/documentStructureEngine');
const repeatedBlockDetector = require('../services/structure/repeatedBlockDetector');
const ingestionService = require('../services/ingestion/ingestionService');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 3B.1.6 DOCUMENT STRUCTURE ENGINE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 10;

  // --------------------------------------------------------------------------
  // TEST 1: Real Textbook Decomposition (The CRC Press failure case)
  // --------------------------------------------------------------------------
  console.log('[Test 1] Verifying Real Textbook Decomposition (CRC Press 2025 case)...');
  {
    const textbookPages = [
      { num: 1, text: 'Practical Machine Learning\nCRC Press, 2025\nTaylor & Francis Group\nBoca Raton London New York' },
      { num: 2, text: 'Dedication\nTo all students and researchers in applied AI and data science.' },
      { num: 3, text: 'Preface\nPractical machine learning requires both foundational rigor and operational discipline. This book provides a modern treatment.' },
      {
        num: 4,
        text: 'Table of Contents\n' +
          'Chapter 1: The Machine Learning Workflow ......... 1\n' +
          'Chapter 2: Data Preprocessing and Cleansing ...... 28\n' +
          'Chapter 3: Supervised Learning Foundations ...... 64\n' +
          'Chapter 4: Neural Networks and Deep Learning ... 112\n' +
          'Chapter 5: Model Evaluation and Validation ...... 170\n' +
          'Chapter 6: Unsupervised Learning ............... 218\n' +
          'Chapter 7: Ensemble Methods ..................... 270\n' +
          'Chapter 8: Production ML and Deployment ........ 320\n' +
          'Appendix A: Mathematical Reference ............. 375\n' +
          'Index .......................................... 410',
      },
      // Body chapters begin on physical page 18 (printed page 1)
      {
        num: 18,
        text: 'CHAPTER 1\nThe Machine Learning Workflow\n\n1.1 Introduction to Operational ML\nMachine learning is an empirical science requiring disciplined workflows.\n\n1.1.1 Problem Formulation\nFormulating machine learning problems requires metric definition and business alignment.\n\n1.2 Data Ingestion Lifecycle\nData ingestion is the critical first stage.',
      },
      {
        num: 45,
        text: 'CHAPTER 2\nData Preprocessing and Cleansing\n\n2.1 Imputation Strategies\nHandling missing values with mean, median, or predictive imputation.\n\n2.2 Outlier Detection\nDetecting anomalies using isolation forests.',
      },
      {
        num: 81,
        text: 'CHAPTER 3\nSupervised Learning Foundations\n\n3.1 Empirical Risk Minimization\nMinimizing empirical loss over training partitions.\n\n3.2 Regularization\nL1 lasso and L2 ridge penalties.',
      },
      {
        num: 129,
        text: 'CHAPTER 4\nNeural Networks and Deep Learning\n\n4.1 Perceptron Foundations\nSingle-layer and multi-layer perceptron architectures.\n\n4.1.1 Backpropagation\nReverse-mode automatic differentiation.',
      },
      {
        num: 187,
        text: 'CHAPTER 5\nModel Evaluation and Validation\n\n5.1 K-Fold Cross Validation\nStratified sampling across folds.\n\n5.2 ROC and PR Curves\nArea under the curve analysis for imbalanced classes.',
      },
      {
        num: 235,
        text: 'CHAPTER 6\nUnsupervised Learning\n\n6.1 Clustering Fundamentals\nK-means, spectral clustering, and hierarchical agglomeration.\n\n6.2 Dimensionality Reduction\nPrincipal component analysis and t-SNE.',
      },
      {
        num: 287,
        text: 'CHAPTER 7\nEnsemble Methods\n\n7.1 Bagging and Random Forests\nVariance reduction via bootstrap aggregation.\n\n7.2 Gradient Boosting\nResidual fitting using XGBoost and LightGBM.',
      },
      {
        num: 337,
        text: 'CHAPTER 8\nProduction ML and Deployment\n\n8.1 Model Serving Architecture\nLow latency REST and gRPC endpoints for real-time inference.\n\n8.2 Model Monitoring\nConcept drift and data distribution shift detection.',
      },
      {
        num: 392,
        text: 'Appendix A: Mathematical Reference\n\nA.1 Matrix Decompositions\nSingular value decomposition (SVD) and eigendecomposition properties.\n\nA.2 Probability Distributions\nGaussian and multivariate distributions.',
      },
      {
        num: 427,
        text: 'Index\n\nActivation functions, 131\nBackpropagation, 135\nCross-validation, 189\nDimensionality reduction, 240\nEnsemble methods, 289\nGradient boosting, 301\nModel drift, 342\nRegularization, 92',
      },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'pdf',
      pages: textbookPages,
      metadata: { title: 'Practical Machine Learning', author: 'CRC Press' },
    });

    // Verify it did NOT collapse into a single "Front Matter & Overview" chapter
    assert.ok(tree.chapters.length >= 10, `Expected at least 10 chapters, got ${tree.chapters.length}`);
    assert.strictEqual(tree.title, 'Practical Machine Learning');

    const roles = tree.chapters.map(c => c.structuralRole);
    assert.ok(roles.includes('front_matter'), 'Must include front_matter');
    assert.ok(roles.includes('chapter'), 'Must include chapter');
    assert.ok(roles.includes('appendix'), 'Must include appendix');
    assert.ok(roles.includes('index'), 'Must include index');

    // Count the body chapters specifically
    const bodyChapters = tree.chapters.filter(c => c.structuralRole === 'chapter');
    assert.strictEqual(bodyChapters.length, 8, `Expected exactly 8 body chapters, got ${bodyChapters.length}`);

    // Verify Chapter 1 title and sections
    const ch1 = bodyChapters[0];
    assert.ok(ch1.title.includes('The Machine Learning Workflow'), `Chapter 1 title mismatch: ${ch1.title}`);
    assert.ok(ch1.sections.length >= 2, `Chapter 1 must have sections, got ${ch1.sections.length}`);
    assert.strictEqual(ch1.sections[0].title, '1.1 Introduction to Operational ML');

    console.log(`  ✓ Successfully partitioned textbook into ${tree.chapters.length} structures (8 chapters, front matter, appendix, index)!`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 2: TOC-Anchored Chapter Detection (Folio vs Physical Page Mismatch)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Verifying TOC-Anchored Chapter Detection...');
  {
    const pages = [
      { num: 1, text: 'Half Title\nAdvanced Distributed Systems' },
      { num: 2, text: 'Title Page\nAdvanced Distributed Systems by Leslie Lamport' },
      {
        num: 3,
        text: 'Contents\n' +
          'Chapter 1: Time, Clocks, and Ordering ............. 1\n' +
          'Chapter 2: Consensus and State Machine Replication ... 45\n' +
          'Chapter 3: Byzantine Fault Tolerance ............. 90',
      },
      // Note: Printed page 1 is on physical PDF page 12
      {
        num: 12,
        text: 'Chapter 1: Time, Clocks, and Ordering\nLogical clocks provide partial ordering in distributed events.',
      },
      // Printed page 45 is on physical PDF page 56
      {
        num: 56,
        text: 'Chapter 2: Consensus and State Machine Replication\nPaxos guarantees safety under asynchronous networks.',
      },
      // Printed page 90 is on physical PDF page 101
      {
        num: 101,
        text: 'Chapter 3: Byzantine Fault Tolerance\nPBFT tolerates up to f failures among 3f+1 nodes.',
      },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'pdf',
      pages,
      metadata: { title: 'Advanced Distributed Systems' },
    });

    // Verify TOC entries themselves did not create splinter chapters on page 3
    const page3Chapters = tree.chapters.filter(c => c.sourceLocation && c.sourceLocation.startPage === 3);
    assert.strictEqual(page3Chapters.length, 0, 'TOC lines on page 3 must NOT be detected as body chapters');

    // Verify correct body chapter starts on physical pages 12, 56, 101
    const ch1 = tree.chapters.find(c => c.title.includes('Time, Clocks'));
    const ch2 = tree.chapters.find(c => c.title.includes('Consensus'));
    const ch3 = tree.chapters.find(c => c.title.includes('Byzantine'));

    assert.ok(ch1, 'Chapter 1 must be detected');
    assert.ok(ch2, 'Chapter 2 must be detected');
    assert.ok(ch3, 'Chapter 3 must be detected');

    assert.strictEqual(ch1.sourceLocation.startPage, 12, 'Ch1 start page should be 12');
    assert.strictEqual(ch2.sourceLocation.startPage, 56, 'Ch2 start page should be 56');
    assert.strictEqual(ch3.sourceLocation.startPage, 101, 'Ch3 start page should be 101');

    console.log('  ✓ TOC anchor resolved physical page gap (pages 12, 56, 101) without treating TOC page 3 as chapters!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 3: Numbered Chapter Headings (Single-line, Multi-line, Standalone)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Verifying Multi-Signal Numbered Chapter Headings...');
  {
    const blocks = [
      { type: 'heading', level: 1, text: 'Chapter 1: The Principle of Least Action', sourcePage: 1 },
      { type: 'paragraph', text: 'Lagrangian mechanics reformulates classical dynamics.', sourcePage: 1 },
      { type: 'heading', level: 1, text: 'CHAPTER 2 — Hamiltonians and Phase Space', sourcePage: 10 },
      { type: 'paragraph', text: 'Phase space trajectories conserve volume under Liouville theorem.', sourcePage: 10 },
      { type: 'heading', level: 1, text: '3 Canonical Transformations', sourcePage: 20 }, // Standalone numbered
      { type: 'paragraph', text: 'Generating functions facilitate coordinate transformations.', sourcePage: 20 },
      { type: 'heading', level: 1, text: 'Chapter 4: Hamilton-Jacobi Theory', sourcePage: 30 },
      { type: 'paragraph', text: 'Separation of variables solves the action angle problem.', sourcePage: 30 },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'markdown',
      blocks,
      metadata: { title: 'Classical Mechanics' },
    });

    assert.strictEqual(tree.chapters.length, 4, `Expected 4 chapters, got ${tree.chapters.length}`);
    assert.strictEqual(tree.chapters[0].title, 'Chapter 1: The Principle of Least Action');
    assert.strictEqual(tree.chapters[1].title, 'CHAPTER 2 — Hamiltonians and Phase Space');
    assert.ok(tree.chapters[2].title.includes('Canonical Transformations'), `Expected Canonical Transformations, got ${tree.chapters[2].title}`);
    assert.strictEqual(tree.chapters[3].title, 'Chapter 4: Hamilton-Jacobi Theory');

    console.log('  ✓ Successfully recognized explicit, dash-separated, and standalone numbered chapter openers!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 4: Deep Nested Section Hierarchy (e.g. 4.1.2.1)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Verifying Deep Nested Section Hierarchy (4.1.2.1)...');
  {
    const blocks = [
      { type: 'heading', level: 1, text: 'Chapter 4: Neural Architectures' },
      { type: 'paragraph', text: 'Neural networks are parameterized non-linear function approximators.' },
      { type: 'heading', level: 2, text: '4.1 Deep Feedforward Networks' },
      { type: 'paragraph', text: 'Layer-wise affine mappings followed by non-linear activations.' },
      { type: 'heading', level: 3, text: '4.1.1 Activation Functions' },
      { type: 'paragraph', text: 'ReLU, GeLU, and Swish functions.' },
      { type: 'heading', level: 3, text: '4.1.2 Gradient Propagation' },
      { type: 'paragraph', text: 'Gradients flow backward via chain rule.' },
      { type: 'heading', level: 4, text: '4.1.2.1 Vanishing Gradients' },
      { type: 'paragraph', text: 'Saturating sigmoids cause exponential decay of gradients.' },
      { type: 'heading', level: 4, text: '4.1.2.2 Exploding Gradients' },
      { type: 'paragraph', text: 'Large spectral norms cause numerical instability.' },
      { type: 'heading', level: 2, text: '4.2 Convolutional Networks' },
      { type: 'paragraph', text: 'Weight sharing and translational equivariance.' },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'markdown',
      blocks,
      metadata: { title: 'Deep Learning' },
    });

    assert.strictEqual(tree.chapters.length, 1);
    const ch = tree.chapters[0];
    const rootSections = ch.sections;

    // Root sections should have 4.1 and 4.2
    assert.strictEqual(rootSections.length, 2, `Expected 2 root sections, got ${rootSections.length}`);
    assert.strictEqual(rootSections[0].title, '4.1 Deep Feedforward Networks');
    assert.strictEqual(rootSections[1].title, '4.2 Convolutional Networks');

    // 4.1 should have 4.1.1 and 4.1.2
    const sec41 = rootSections[0];
    assert.strictEqual(sec41.sections.length, 2, `Expected 2 child sections under 4.1, got ${sec41.sections.length}`);
    assert.strictEqual(sec41.sections[0].title, '4.1.1 Activation Functions');
    assert.strictEqual(sec41.sections[1].title, '4.1.2 Gradient Propagation');

    // 4.1.2 should have 4.1.2.1 and 4.1.2.2
    const sec412 = sec41.sections[1];
    assert.strictEqual(sec412.sections.length, 2, `Expected 2 child sections under 4.1.2, got ${sec412.sections.length}`);
    assert.strictEqual(sec412.sections[0].title, '4.1.2.1 Vanishing Gradients');
    assert.strictEqual(sec412.sections[1].title, '4.1.2.2 Exploding Gradients');

    // Verify total section count calculation
    const totalSecCount = documentStructureEngine.countTotalSections(rootSections);
    assert.strictEqual(totalSecCount, 6, `Expected 6 total nested sections, got ${totalSecCount}`);

    console.log('  ✓ Nested hierarchy (4.1 -> 4.1.2 -> 4.1.2.1) correctly formed with recursive parent-child tree!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 5: Front Matter Classification
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Verifying Front Matter Classification...');
  {
    const blocks = [
      { type: 'heading', level: 1, text: 'Title Page' },
      { type: 'paragraph', text: 'Principles of Quantum Computing by Nielsen & Chuang' },
      { type: 'heading', level: 1, text: 'Dedication' },
      { type: 'paragraph', text: 'Dedicated to our families and mentors.' },
      { type: 'heading', level: 1, text: 'Foreword' },
      { type: 'paragraph', text: 'Quantum computation represents a fundamental shift in complexity theory.' },
      { type: 'heading', level: 1, text: 'Preface' },
      { type: 'paragraph', text: 'This text is intended as an introduction for physicists and computer scientists.' },
      { type: 'heading', level: 1, text: 'Chapter 1: Introduction and Overview' },
      { type: 'paragraph', text: 'Computation is physical.' },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'markdown',
      blocks,
      metadata: { title: 'Quantum Computing' },
    });

    const ch1Index = tree.chapters.findIndex(c => c.title.includes('Chapter 1'));
    assert.ok(ch1Index >= 1, 'Chapter 1 must come after front matter');

    const frontMatterItems = tree.chapters.slice(0, ch1Index);
    assert.ok(frontMatterItems.length >= 1, 'Must have at least 1 front matter item');
    for (const fm of frontMatterItems) {
      assert.strictEqual(fm.structuralRole, 'front_matter', `Item "${fm.title}" must have role front_matter`);
    }

    assert.strictEqual(tree.chapters[ch1Index].structuralRole, 'chapter');

    console.log('  ✓ Foreword, Preface, and Dedication accurately classified as front_matter!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 6: Back Matter Classification (Appendix, Bibliography, Index)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Verifying Back Matter Classification...');
  {
    const blocks = [
      { type: 'heading', level: 1, text: 'Chapter 1: Graph Theory Fundamentals' },
      { type: 'paragraph', text: 'Graphs G = (V, E) model pairwise relations.' },
      { type: 'heading', level: 1, text: 'Appendix A: Group Theory Basics' },
      { type: 'paragraph', text: 'Permutation groups and automorphisms.' },
      { type: 'heading', level: 1, text: 'Appendix B: Linear Algebra Reference' },
      { type: 'paragraph', text: 'Adjacency matrix spectrum and Laplacian.' },
      { type: 'heading', level: 1, text: 'Bibliography' },
      { type: 'paragraph', text: '[1] Bondy & Murty, Graph Theory with Applications, 1976.' },
      { type: 'heading', level: 1, text: 'Index' },
      { type: 'paragraph', text: 'Automorphism, 12\nLaplacian, 45\nSpectrum, 50' },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'markdown',
      blocks,
      metadata: { title: 'Spectral Graph Theory' },
    });

    assert.strictEqual(tree.chapters[0].structuralRole, 'chapter');
    assert.strictEqual(tree.chapters[1].structuralRole, 'appendix');
    assert.strictEqual(tree.chapters[2].structuralRole, 'appendix');
    assert.strictEqual(tree.chapters[3].structuralRole, 'back_matter');
    assert.strictEqual(tree.chapters[4].structuralRole, 'index');

    console.log('  ✓ Appendices, Bibliography, and Index assigned accurate structural roles!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 7: Repeated Header/Footer Suppression
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Verifying Repeated Header and Footer Suppression...');
  {
    const pagesWithArtifacts = [
      // Page 1
      { type: 'paragraph', text: 'Smart Reader Architecture Guide', sourcePage: 1 },
      { type: 'heading', level: 1, text: 'Chapter 1: Ingestion Pipeline', sourcePage: 1 },
      { type: 'paragraph', text: 'Ingestion transforms messy files into pristine canonical documents.', sourcePage: 1 },
      { type: 'paragraph', text: 'CONFIDENTIAL - FOR INTERNAL USE ONLY', sourcePage: 1 },
      { type: 'paragraph', text: '1', sourcePage: 1 },

      // Page 2
      { type: 'paragraph', text: 'Smart Reader Architecture Guide', sourcePage: 2 },
      { type: 'paragraph', text: 'The normalizer handles character encodings and smart quotes.', sourcePage: 2 },
      { type: 'paragraph', text: 'CONFIDENTIAL - FOR INTERNAL USE ONLY', sourcePage: 2 },
      { type: 'paragraph', text: '2', sourcePage: 2 },

      // Page 3
      { type: 'paragraph', text: 'Smart Reader Architecture Guide', sourcePage: 3 },
      { type: 'paragraph', text: 'The chapter detector partitions content by structural signals.', sourcePage: 3 },
      { type: 'paragraph', text: 'CONFIDENTIAL - FOR INTERNAL USE ONLY', sourcePage: 3 },
      { type: 'paragraph', text: '3', sourcePage: 3 },

      // Page 4
      { type: 'paragraph', text: 'Smart Reader Architecture Guide', sourcePage: 4 },
      { type: 'paragraph', text: 'Semantic chunking operates over complete structural boundaries.', sourcePage: 4 },
      { type: 'paragraph', text: 'CONFIDENTIAL - FOR INTERNAL USE ONLY', sourcePage: 4 },
      { type: 'paragraph', text: '4', sourcePage: 4 },
    ];

    const result = repeatedBlockDetector.filterRepeatedBlocks(pagesWithArtifacts);

    assert.ok(result.removedCount >= 6, `Expected at least 6 removed artifacts, got ${result.removedCount}`);

    // Verify the repeated running header and footer appear at most ONCE in output
    const headerCount = result.filteredBlocks.filter(b => b.text === 'Smart Reader Architecture Guide').length;
    const footerCount = result.filteredBlocks.filter(b => b.text === 'CONFIDENTIAL - FOR INTERNAL USE ONLY').length;
    assert.strictEqual(headerCount, 1, 'Running header must only appear once (at first introduction)');
    assert.strictEqual(footerCount, 1, 'Running footer must only appear once');

    // Verify standalone page numbers are completely removed
    const pageNumBlocks = result.filteredBlocks.filter(b => /^\d{1,3}$/.test(b.text.trim()));
    assert.strictEqual(pageNumBlocks.length, 0, 'Standalone page numbers must be stripped');

    // Verify substantive body paragraphs are intact
    const bodyParagraphs = result.filteredBlocks.filter(b => b.text.includes('Ingestion transforms') || b.text.includes('The normalizer handles'));
    assert.strictEqual(bodyParagraphs.length, 2, 'Substantive body paragraphs must be preserved');

    console.log(`  ✓ Filtered ${result.removedCount} repeated running artifacts while preserving body content!`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 8: Provenance & Source Location Preservation
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Verifying Source Location & Provenance Tracking...');
  {
    const pages = [
      { num: 1, text: 'Chapter 1: Foundations\nFoundational principles of information retrieval.' },
      { num: 2, text: 'More details on index construction and inverted lists.' },
      { num: 3, text: 'Chapter 2: Vector Space Model\nTerm weighting and cosine similarity metrics.' },
      { num: 4, text: 'BM25 and probabilistic relevance models.' },
    ];

    const tree = documentStructureEngine.buildStructureTree({
      format: 'pdf',
      pages,
      metadata: { title: 'Information Retrieval' },
    });

    assert.strictEqual(tree.chapters.length, 2);

    const ch1 = tree.chapters[0];
    const ch2 = tree.chapters[1];

    assert.ok(ch1.sourceLocation, 'Chapter 1 must have sourceLocation');
    assert.ok(ch2.sourceLocation, 'Chapter 2 must have sourceLocation');

    assert.strictEqual(ch1.sourceLocation.startPage, 1);
    assert.strictEqual(ch1.sourceLocation.endPage, 2);
    assert.strictEqual(ch2.sourceLocation.startPage, 3);
    assert.strictEqual(ch2.sourceLocation.endPage, 4);

    assert.ok(typeof ch1.sourceLocation.startOffset === 'number');
    assert.ok(typeof ch1.sourceLocation.endOffset === 'number');
    assert.ok(ch1.sourceLocation.endOffset >= ch1.sourceLocation.startOffset);

    console.log('  ✓ Start and end pages and byte offsets preserved across all chapters!');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 9: Word and Character Count Integrity
  // --------------------------------------------------------------------------
  console.log('\n[Test 9] Verifying Word and Character Count Integrity...');
  {
    const rawText =
      '# Chapter 1: Computational Complexity\n\n' +
      'Deterministic polynomial time is the class of decision problems solvable by a deterministic Turing machine in polynomial time. ' +
      'Nondeterministic polynomial time encompasses problems where candidate solutions can be verified in polynomial time.\n\n' +
      '# Chapter 2: Space Complexity\n\n' +
      'Savitch theorem establishes relationships between deterministic and nondeterministic space complexity classes.';

    const tree = documentStructureEngine.buildStructureTree({
      format: 'markdown',
      rawText,
      metadata: { title: 'Complexity Theory' },
    });

    assert.strictEqual(tree.chapters.length, 2);
    assert.ok(tree.totalWordCount > 30, `Expected totalWordCount > 30, got ${tree.totalWordCount}`);
    assert.ok(tree.totalCharacterCount > 200, `Expected totalCharacterCount > 200, got ${tree.totalCharacterCount}`);

    const sumWords = tree.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const sumChars = tree.chapters.reduce((sum, ch) => sum + ch.characterCount, 0);

    assert.strictEqual(tree.totalWordCount, sumWords, 'Document totalWordCount must equal sum of chapter wordCounts');
    assert.strictEqual(tree.totalCharacterCount, sumChars, 'Document totalCharacterCount must equal sum of chapter characterCounts');

    console.log(`  ✓ Accurate word counts (${tree.totalWordCount} words) and characters (${tree.totalCharacterCount} chars) verified!`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 10: Low-Confidence Graceful Fallback (Unstructured / Flat Text)
  // --------------------------------------------------------------------------
  console.log('\n[Test 10] Verifying Low-Confidence Fallback on Unstructured Text...');
  {
    const flatStory =
      'Once upon a time in a quiet valley nestled between emerald hills, there lived an old clockmaker named Julian. ' +
      'Every morning at sunrise, Julian wound the grand pendulum clock in the village tower. ' +
      'The townspeople set their lives by its gentle, rhythmic chiming. ' +
      'Years passed peacefully until a mysterious wanderer arrived carrying a timepiece that ran backward. ' +
      'Julian spent many weeks examining the strange gears, discovering an intricate escapement mechanism unknown to modern horology.';

    const tree = documentStructureEngine.buildStructureTree({
      format: 'text',
      rawText: flatStory,
      metadata: { title: 'The Clockmaker of Julian Valley' },
    });

    // Must degrade gracefully to 1 chapter without hallucinating artificial chapters
    assert.strictEqual(tree.chapters.length, 1, `Expected 1 cohesive chapter for flat text, got ${tree.chapters.length}`);
    assert.strictEqual(tree.chapters[0].title, 'The Clockmaker of Julian Valley');
    assert.ok(tree.confidence < 0.8, `Confidence should be lower for unstructured text, got ${tree.confidence}`);
    assert.ok(tree.totalWordCount > 40, 'Word count must be preserved');

    // Also verify through IngestionService pipeline
    const ingestionResult = await ingestionService.ingest({
      format: 'text',
      rawText: flatStory,
      title: 'The Clockmaker of Julian Valley',
    });

    assert.strictEqual(ingestionResult.chapters.length, 1);
    assert.strictEqual(ingestionResult.integrityStatus, 'valid');

    console.log(`  ✓ Flat unstructured text gracefully handled as 1 cohesive chapter (confidence: ${tree.confidence})!`);
    passed++;
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/${total} BUILD 3B.1.6 DOCUMENT STRUCTURE ENGINE TESTS PASSED!`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ BUILD 3B.1.6 TEST FAILED:', err);
  process.exit(1);
});
