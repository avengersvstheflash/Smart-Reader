'use strict';

const assert = require('assert');
const documentStructureEngine = require('../services/structure/documentStructureEngine');

function runTests() {
  console.log('--- f32_3_toc_chapter_builder_test.js ---');
  
  const metadata = { title: 'Test', author: 'Author' };
  
  // T1: Flattens level <= 2 into chapters, ignores level 3.
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
  assert.strictEqual(res1.length, 3, 'Should ignore level 3 entry');
  assert.strictEqual(res1[0].title, 'Chapter 1');
  assert.strictEqual(res1[1].title, '1.1 Intro');
  assert.strictEqual(res1[2].title, 'Chapter 2');

  // T2: Maps TOC entries to correct blocks based on page number.
  assert.strictEqual(res1[0].pageStart, 1);
  assert.strictEqual(res1[0].blocks.length, 1);
  assert.strictEqual(res1[1].blocks.length, 2); // Includes page 2 and 3
  
  // T3: Falls back to legacy (returns null) if TOC < 3 entries.
  const toc2 = [
    { level: 1, title: 'Chapter 1', page: 1 },
    { level: 1, title: 'Chapter 2', page: 2 }
  ];
  const res2 = documentStructureEngine.buildChaptersFromToc(toc2, blocks1, metadata);
  assert.strictEqual(res2, null, 'Should return null for < 3 entries');

  // T4: Filters front matter out of the chapter list.
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
  assert.strictEqual(res3.length, 3, 'Should filter Preface');
  assert.strictEqual(res3[0].title, 'Chapter 1');
  assert.strictEqual(res3[0].blocks[0].text, 'Preface text', 'First chapter should engulf preceding front matter blocks to prevent data loss');

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
  assert.strictEqual(res1[0].pageEnd, 1);
  assert.strictEqual(res1[1].pageEnd, 3); // blocks span page 2 to 3
  
  // T8: Preserves exact title from TOC.
  assert.strictEqual(res1[1].title, '1.1 Intro');
  
  console.log('f32_3_toc_chapter_builder_test.js passed');
}

runTests();
