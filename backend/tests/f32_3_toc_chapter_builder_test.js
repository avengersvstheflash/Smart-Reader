'use strict';

const assert = require('assert');
const documentStructureEngine = require('../services/structure/documentStructureEngine');

function runTests() {
  console.log('--- f32_3_toc_chapter_builder_test.js ---');
  
  const metadata = { title: 'Test', author: 'Author' };
  
  // T1: Filters to level === 1 only, ignores level 2 and level 3 entries.
  const toc1 = [
    { level: 1, title: 'Chapter 1', page: 1 },
    { level: 2, title: '1.1 Intro', page: 2 },
    { level: 3, title: '1.1.1 Detail', page: 3 },
    { level: 1, title: 'Chapter 2', page: 4 }
  ];
  
  const blocks1 = [
    { text: 'Ch 1', sourcePage: 1 },
    { text: '1.1', sourcePage: 2 },
    { text: 'Detail', sourcePage: 3 },
    { text: 'Ch 2', sourcePage: 4 }
  ];
  
  const res1 = documentStructureEngine.buildChaptersFromToc(toc1, blocks1, metadata);
  assert.ok(res1, 'Should return chapters');
  assert.strictEqual(res1.length, 2, 'Should only include level 1 entries (ignoring level 2 and 3)');
  assert.strictEqual(res1[0].title, 'Chapter 1');
  assert.strictEqual(res1[1].title, 'Chapter 2');

  // T2: Maps TOC entries to correct blocks based on page number (absorbing L2/L3 blocks into L1).
  assert.strictEqual(res1[0].pageStart, 1);
  assert.strictEqual(res1[0].blocks.length, 3); // Ch 1, 1.1, Detail on pages 1, 2, 3
  assert.strictEqual(res1[1].blocks.length, 1); // Ch 2 on page 4
  
  // T3: Falls back to legacy (returns null) if TOC < 3 entries.
  const toc2 = [
    { level: 1, title: 'Chapter 1', page: 1 },
    { level: 1, title: 'Chapter 2', page: 2 }
  ];
  const res2 = documentStructureEngine.buildChaptersFromToc(toc2, blocks1, metadata);
  assert.strictEqual(res2, null, 'Should return null for < 3 entries');

  // T4: Classifies front matter as structural_role='front_matter'.
  const toc3 = [
    { level: 1, title: 'Preface', page: 1 },
    { level: 1, title: 'Chapter 1', page: 2 },
    { level: 1, title: 'Chapter 2', page: 3 },
    { level: 1, title: 'Chapter 3', page: 4 }
  ];
  const blocks3 = [
    { text: 'Preface text', sourcePage: 1 },
    { text: 'Ch 1', sourcePage: 2 },
    { text: 'Ch 2', sourcePage: 3 },
    { text: 'Ch 3', sourcePage: 4 }
  ];
  const res3 = documentStructureEngine.buildChaptersFromToc(toc3, blocks3, metadata);
  assert.strictEqual(res3.length, 4, 'Includes Preface tagged as front_matter');
  assert.strictEqual(res3[0].title, 'Preface');
  assert.strictEqual(res3[0].structural_role, 'front_matter');
  assert.strictEqual(res3[1].title, 'Chapter 1');
  assert.strictEqual(res3[1].structural_role, 'chapter');

  // T5: Maps to first block > TOC page if exact page missing.
  const toc4 = [
    { level: 1, title: 'Chapter 1', page: 1 },
    { level: 1, title: 'Chapter 2', page: 4 }, // exact page missing
    { level: 1, title: 'Chapter 3', page: 6 }
  ];
  const blocks4 = [
    { text: 'Ch 1', sourcePage: 1 },
    { text: 'Ch 1 cont', sourcePage: 2 },
    { text: 'Ch 2 shifted', sourcePage: 5 }, // Page 5 instead of 4
    { text: 'Ch 3', sourcePage: 6 }
  ];
  const res4 = documentStructureEngine.buildChaptersFromToc(toc4, blocks4, metadata);
  assert.strictEqual(res4.length, 3);
  assert.strictEqual(res4[1].blocks[0].text, 'Ch 2 shifted');

  // T6: Handles empty blocks gracefully.
  const toc5 = [
    { level: 1, title: 'Chapter 1', page: 1 },
    { level: 1, title: 'Chapter 2', page: 2 },
    { level: 1, title: 'Chapter 3', page: 3 }
  ];
  const blocks5 = [
    { text: 'Only page 1', sourcePage: 1 }
  ];
  const res5 = documentStructureEngine.buildChaptersFromToc(toc5, blocks5, metadata);
  assert.strictEqual(res5.length, 3);
  assert.strictEqual(res5[1].blocks.length, 0); // Empty blocks for Chapter 2
  assert.strictEqual(res5[1].pageStart, 2);
  
  // T7: Sets pageEnd correctly based on next chapter.
  assert.strictEqual(res1[0].pageEnd, 3); // Chapter 1 absorbs up to page 3
  assert.strictEqual(res1[1].pageEnd, 4); // Chapter 2 on page 4
  
  // T8: Preserves exact title from TOC.
  assert.strictEqual(res1[0].title, 'Chapter 1');
  assert.strictEqual(res1[1].title, 'Chapter 2');

  // T9: TOC with L1 + L2 entries -> only L1 becomes chapters; L2 blocks are absorbed into parent L1
  const toc9 = [
    { level: 1, title: 'Chapter 1: Basics', page: 1 },
    { level: 2, title: '1.1 Core Concepts', page: 2 },
    { level: 2, title: '1.2 Advanced Topics', page: 3 },
    { level: 1, title: 'Chapter 2: Architecture', page: 4 }
  ];
  const blocks9 = [
    { text: 'Ch 1 Intro', sourcePage: 1 },
    { text: 'Section 1.1 text', sourcePage: 2 },
    { text: 'Section 1.2 text', sourcePage: 3 },
    { text: 'Ch 2 Intro', sourcePage: 4 }
  ];
  const res9 = documentStructureEngine.buildChaptersFromToc(toc9, blocks9, metadata);
  assert.ok(res9, 'T9 should return chapters');
  assert.strictEqual(res9.length, 2, 'T9: Only L1 entries become chapters');
  assert.strictEqual(res9[0].title, 'Chapter 1: Basics');
  assert.strictEqual(res9[1].title, 'Chapter 2: Architecture');
  assert.strictEqual(res9[0].blocks.length, 3, 'T9: L2 blocks are absorbed into parent L1 chapter');
  assert.strictEqual(res9[1].blocks.length, 1, 'T9: Next chapter gets its own block');

  // T10: TOC containing "Acknowledgments" (L1) -> structural_role = 'front_matter', not 'chapter'
  const toc10 = [
    { level: 1, title: 'Acknowledgments', page: 1 },
    { level: 1, title: "Author's Note", page: 2 },
    { level: 1, title: 'A Note on AI Assistance', page: 3 },
    { level: 1, title: 'Notation', page: 4 },
    { level: 1, title: 'Chapter 1', page: 5 }
  ];
  const blocks10 = [
    { text: 'Thank you all', sourcePage: 1 },
    { text: 'From the author', sourcePage: 2 },
    { text: 'AI used responsibly', sourcePage: 3 },
    { text: 'Math symbols', sourcePage: 4 },
    { text: 'Chapter 1 content', sourcePage: 5 }
  ];
  const res10 = documentStructureEngine.buildChaptersFromToc(toc10, blocks10, metadata);
  assert.ok(res10, 'T10 should return chapters');
  assert.strictEqual(res10.length, 5);
  assert.strictEqual(res10[0].title, 'Acknowledgments');
  assert.strictEqual(res10[0].structural_role, 'front_matter', 'T10: Acknowledgments must be front_matter');
  assert.strictEqual(res10[1].title, "Author's Note");
  assert.strictEqual(res10[1].structural_role, 'front_matter', "T10: Author's Note must be front_matter");
  assert.strictEqual(res10[2].title, 'A Note on AI Assistance');
  assert.strictEqual(res10[2].structural_role, 'front_matter', 'T10: A Note on AI Assistance must be front_matter');
  assert.strictEqual(res10[3].title, 'Notation');
  assert.strictEqual(res10[3].structural_role, 'front_matter', 'T10: Notation must be front_matter');

  // T11: TOC containing "Introduction" (L1) -> structural_role = 'chapter'
  const toc11 = [
    { level: 1, title: 'Introduction', page: 1 },
    { level: 1, title: 'Chapter 1', page: 2 },
    { level: 1, title: 'Chapter 2', page: 3 }
  ];
  const blocks11 = [
    { text: 'Welcome to the book', sourcePage: 1 },
    { text: 'Ch 1 content', sourcePage: 2 },
    { text: 'Ch 2 content', sourcePage: 3 }
  ];
  const res11 = documentStructureEngine.buildChaptersFromToc(toc11, blocks11, metadata);
  assert.ok(res11, 'T11 should return chapters');
  assert.strictEqual(res11[0].title, 'Introduction');
  assert.strictEqual(res11[0].structural_role, 'chapter', 'T11: Introduction must be chapter');

  // T12: TOC with only L2 entries (no L1) -> fallback to null
  const toc12 = [
    { level: 2, title: '1.1 Subsection A', page: 1 },
    { level: 2, title: '1.2 Subsection B', page: 2 },
    { level: 2, title: '1.3 Subsection C', page: 3 }
  ];
  const blocks12 = [
    { text: 'Text A', sourcePage: 1 },
    { text: 'Text B', sourcePage: 2 },
    { text: 'Text C', sourcePage: 3 }
  ];
  const res12 = documentStructureEngine.buildChaptersFromToc(toc12, blocks12, metadata);
  assert.strictEqual(res12, null, 'T12: Should fallback to null when no L1 entries exist');

  console.log('f32_3_toc_chapter_builder_test.js passed');
}

runTests();
