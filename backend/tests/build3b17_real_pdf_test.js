/**
 * BUILD 3B.1.7: Real PDF Structural Recovery Regression Test Suite
 *
 * Verifies that the extraction boundary and DocumentStructureEngine
 * correctly parse complex real-world PDFs (e.g. CRC Press textbook format)
 * without collapsing into anomalous sections or losing chapter boundaries.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pdfParser = require('../services/ingestion/parsers/pdfjsParser');

async function runRealPdfSuite() {
  console.log('================================================================');
  console.log('🚀 RUNNING BUILD 3B.1.7 REAL PDF STRUCTURAL RECOVERY TEST SUITE');
  console.log('================================================================\n');

  const binaryPdfPath = path.join(__dirname, 'fixtures', 'practical_machine_learning.pdf');
  let result;

  if (fs.existsSync(binaryPdfPath)) {
    console.log(`[Source] Reading actual binary PDF fixture: ${binaryPdfPath}`);
    const buffer = fs.readFileSync(binaryPdfPath);
    result = await pdfParser.parse(buffer, {
      title: 'Practical Machine Learning: A Beginner’s Guide with Ethical Insights',
    });
  } else {
    console.log('[Notice] Binary PDF not found at fixtures/practical_machine_learning.pdf.');
    console.log('[Fixture] Using faithful extraction-level regression fixture modeling the exact OCR raw text patterns from the 3B.1.6 audit.\n');

    const pages = [
      {
        num: 1,
        text: "Practical Machine Learning\nA Beginner's Guide with Ethical Insights\nAfriAI Research Lab\nCRC Press, Taylor & Francis Group",
      },
      {
        num: 4,
        text: "Practical Machine Learning\nA Beginner's Guide with Ethical Insights\nFirst Edition published 2025\nby CRC Press",
      },
      {
        num: 5,
        text: "DOI: 10.1201/9781003486817\nCopyright © 2025 AfriAI Research Lab\nAll rights reserved. No part of this book may be reprinted...",
      },
      {
        num: 6,
        text: [
          'Contents',
          'About the authors\tvi',
          'Preface\tix',
          'Acknowledgments\tx',
          'Glossary\txi',
          '1\tFundamentals of machine learning\t1',
          '2\tMathematics for machine learning\t18',
          '3\tData preparation\t76',
          '4\tMachine learning operations\t95',
          '5\tMachine learning software and hardware requirements\t110',
          '6\tResponsible AI and explainable AI\t138',
          '7\tArtificial general intelligence\t152',
          '8\tMachine learning step-by-step practical examples\t162',
          'Appendix: Machine learning resources\t207',
          'Index\t210',
        ].join('\n'),
      },
      {
        num: 7,
        text: 'About the authors\nDr. E. M. is a senior research scientist in artificial intelligence...\nDr. S. K. specializes in ethical algorithmic governance...',
      },
      {
        num: 10,
        text: 'Preface\nThis book aims to provide an accessible introduction to the core principles of modern machine learning for practitioners.',
      },
      {
        num: 11,
        text: [
          'Acknowledgments',
          'This textbook was prepared by the AfriAI Research Lab with the aid of a grant from the AI for Development in Africa Program.',
          'The authors extend their appreciation to all reviewers, contributors, and the University of Dodoma for their unwavering institutional support.',
        ].join('\n'),
      },
      {
        num: 12,
        text: 'Glossary\nActivation Function: A mathematical function determining neural network output.\nBias: Systematic error introduced into statistical models.',
      },
      {
        num: 14,
        text: [
          '1\tDOI: 10.1201/9781003486817-1 1Fundamentals of machine learning',
          'This chapter has been made available under a CC-BY-NC-ND 4.0 license.',
          'Upon completing this chapter, learners should be able to understand fundamental definitions.',
          '1.1 WHAT IS MACHINE LEARNING?',
          'Machine learning is an application of artificial intelligence that provides systems the ability to automatically learn and improve from experience.',
          '1.2 TYPES OF MACHINE LEARNING',
          'Supervised learning, unsupervised learning, and reinforcement learning represent the primary computational learning paradigms.',
        ].join('\n'),
      },
      {
        num: 20,
        text: [
          '1.3 APPLICATIONS OF MACHINE LEARNING',
          'Machine learning algorithms are employed in diverse sectors including healthcare diagnostics, algorithmic trading, and autonomous vehicle navigation.',
          'Supervised algorithms require labeled training datasets for parameter optimization.',
        ].join('\n'),
      },
      {
        num: 30,
        text: [
          '1 • Fundamentals of machine learning 17',
          'FURTHER READING',
          'Dönmez, P. (2013). Introduction to machine learning. MIT Press.',
          'Firican, G. (2023). The history of machine learning. Data Science Central.',
          'Mitchell, T. M. (1997). Machine Learning. McGraw-Hill.',
        ].join('\n'),
      },
      {
        num: 31,
        text: [
          '18\tDOI: 10.1201/9781003486817-2 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 2Mathematics for machine learning',
          'Upon completing this chapter, learners should be able to apply essential linear algebra and calculus concepts.',
          '2.1 LINEAR ALGEBRA',
          'Linear algebra is the foundational mathematical language of modern machine learning algorithms.',
          'Vectors and matrices represent high-dimensional features and parameters.',
          '2.2 CALCULUS AND OPTIMIZATION',
          'Gradient descent algorithms iteratively minimize objective loss functions across parameter space.',
        ].join('\n'),
      },
      {
        num: 76,
        text: [
          '76\tDOI: 10.1201/9781003486817-3 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 3Data preparation',
          'Upon completing this chapter, learners should be able to cleanse and normalize raw tabular data.',
          '3.1 OVERVIEW OF MACHINE LEARNING PROCESS',
          'Feature scaling, imputation of missing values, and categorical encoding are vital steps prior to statistical modeling.',
        ].join('\n'),
      },
      {
        num: 95,
        text: [
          'DOI: 10.1201/9781003486817-4 95 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 4Machine learning operations',
          'Upon completing this chapter, learners should be able to operationalize predictive models in cloud environments.',
          '4.1 MODEL DEVELOPMENT AND DEPLOYMENT',
          'Continuous integration and continuous deployment pipelines ensure reproducible model serving and tracking.',
        ].join('\n'),
      },
      {
        num: 110,
        text: [
          '110\tDOI: 10.1201/9781003486817-5 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 5Machine learning software and hardware requirements',
          'Upon completing this chapter, learners should understand accelerator architectures and modern execution frameworks.',
          '5.1 PROGRAMMING LANGUAGES AND FRAMEWORKS',
          'Python remains the dominant programming ecosystem with libraries like PyTorch, Scikit-Learn, and JAX.',
        ].join('\n'),
      },
      {
        num: 138,
        text: [
          '138\tDOI: 10.1201/9781003486817-6 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 6Responsible AI and explainable AI',
          'Upon completing this chapter, learners should recognize algorithmic bias and interpretability trade-offs.',
          '6.1 RESPONSIBLE AI',
          'Fairness, accountability, transparency, and ethics must be integral to model evaluation and lifecycle governance.',
        ].join('\n'),
      },
      {
        num: 152,
        text: [
          '152\tDOI: 10.1201/9781003486817-7 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 7Artificial general intelligence',
          'Upon completing this chapter, learners should understand theoretical pathways and considerations surrounding general intelligence.',
          '7.1 CATEGORIES OF ARTIFICIAL INTELLIGENCE',
          'Artificial narrow intelligence versus artificial general intelligence and theoretical recursive self-improvement.',
        ].join('\n'),
      },
      {
        num: 162,
        text: [
          '162\tDOI: 10.1201/9781003486817-8 This chapter has been made available under a CC-BY-NC-ND 4.0 license. 8Machine learning step-by-step practical examples',
          'Upon completing this chapter, learners should build end-to-end classification pipelines.',
          '8.1 CASE STUDY: CLASSIFICATION PROBLEM',
          'Step-by-step workflow covering problem formulation, exploratory data analysis, cross-validation, and ROC-AUC evaluation metrics.',
        ].join('\n'),
      },
      {
        num: 207,
        text: [
          '207',
          'Appendix: Machine learning resources',
          'RESOURCE\tSOURCE',
          'Python Programming\thttps://www.python.org',
          'PyTorch Documentation\thttps://pytorch.org',
          'Scikit-Learn Tutorials\thttps://scikit-learn.org',
        ].join('\n'),
      },
      {
        num: 210,
        text: [
          '210',
          'Index',
          'activation functions, 60–62, 74',
          'backpropagation, 80–84',
          'cost function, 32, 45',
          'data preparation, 76–94',
          'gradient descent, 25, 30',
          'linear algebra, 18–28',
        ].join('\n'),
      },
    ];

    result = pdfParser.parseFromPages(pages, {
      title: 'Practical Machine Learning: A Beginner’s Guide with Ethical Insights',
      totalPageCount: 210,
    });
  }

  const { chapters } = result;

  console.log(`Decomposed document into ${chapters.length} structures:`);
  chapters.forEach((c) => {
    console.log(`  - [${c.structuralRole.toUpperCase()}] "${c.title}" (${c.wordCount} words, ${c.sectionCount || 0} sections)`);
  });

  // Assertion 1: Result contains 8 top-level chapters + front matter group + appendix + index
  const bodyChapters = chapters.filter((c) => c.structuralRole === 'chapter');
  const frontMatter = chapters.filter((c) => c.structuralRole === 'front_matter');
  const appendices = chapters.filter((c) => c.structuralRole === 'appendix');
  const indices = chapters.filter((c) => c.structuralRole === 'index');

  console.log('\n[Check 1] Verifying 8 top-level chapters + front matter + appendix + index...');
  assert.strictEqual(
    bodyChapters.length,
    8,
    `Expected 8 top-level body chapters, found ${bodyChapters.length}!`
  );
  assert(frontMatter.length >= 1, 'Expected at least 1 front matter structural group!');
  assert(appendices.length >= 1, 'Expected at least 1 appendix!');
  assert(indices.length >= 1, 'Expected at least 1 index!');
  console.log('  ✓ Verified: exactly 8 body chapters + front matter + appendix + index detected!');

  // Assertion 2: No single chapter has > 20,000 words (Chapter 2 is 58 pages with ~19.3k words; previously 28.3k words)
  console.log('\n[Check 2] Verifying no bloated chapter exceeding 20,000 words...');
  for (const c of chapters) {
    assert(
      c.wordCount < 20000,
      `Chapter "${c.title}" exceeds 20,000 words (wordCount: ${c.wordCount})!`
    );
  }
  console.log('  ✓ Verified: no single chapter has > 20,000 words!');

  // Assertion 3: "FURTHER READING" does NOT contain chapters 2-8
  console.log('\n[Check 3] Verifying "FURTHER READING" does NOT swallow chapters 2-8...');
  const furtherReadingTopLevel = chapters.find((c) => /further\s*reading/i.test(c.title));
  assert(
    !furtherReadingTopLevel,
    `"FURTHER READING" was erroneously classified as a top-level chapter: "${furtherReadingTopLevel?.title}"`
  );
  // Verify that Chapter 1 contains the FURTHER READING subsection/text
  const chapter1 = bodyChapters[0];
  assert(
    chapter1.content.includes('FURTHER READING') || chapter1.canonicalBlocks.some((b) => (b.text || '').includes('FURTHER READING')),
    'Expected FURTHER READING to be scoped within Chapter 1!'
  );
  console.log('  ✓ Verified: "FURTHER READING" remains scoped inside Chapter 1 and did not swallow chapters 2-8!');

  // Assertion 4: "Acknowledgments" word count is < 1,500
  console.log('\n[Check 4] Verifying Acknowledgments word count is < 1,500...');
  const ackStructure = chapters.find((c) => /acknowledg/i.test(c.title));
  if (ackStructure) {
    assert(
      ackStructure.wordCount < 1500,
      `Acknowledgments word count exceeds 1,500 words (found ${ackStructure.wordCount})!`
    );
    console.log(`  ✓ Verified: Acknowledgments word count is ${ackStructure.wordCount} words (< 1,500)!`);
  } else {
    // If grouped under Front Matter & Overview
    const frontGroup = chapters.find((c) => c.structuralRole === 'front_matter');
    assert(
      frontGroup && frontGroup.wordCount < 1500,
      `Front matter group exceeds 1,500 words (found ${frontGroup?.wordCount})!`
    );
    console.log(`  ✓ Verified: Front matter containing Acknowledgments has ${frontGroup.wordCount} words (< 1,500)!`);
  }

  // Assertion 5: Section hierarchy integrity within chapters
  console.log('\n[Check 5] Verifying nested section hierarchy scoped to chapters...');
  const ch1Sections = chapter1.sections || [];
  assert(ch1Sections.length >= 2, `Chapter 1 should contain multiple sections, found ${ch1Sections.length}`);
  const sec1_1 = ch1Sections.find((s) => s.number === '1.1' || s.title.includes('1.1'));
  assert(sec1_1, 'Expected section 1.1 in Chapter 1');
  console.log('  ✓ Verified: section hierarchy accurately scoped within individual chapters!');

  console.log('\n================================================================');
  console.log('🎉 ALL BUILD 3B.1.7 REAL PDF RECOVERY REGRESSION TESTS PASSED!');
  console.log('================================================================');
}

runRealPdfSuite().catch((err) => {
  console.error('\n❌ BUILD 3B.1.7 TEST FAILED:', err);
  process.exit(1);
});
