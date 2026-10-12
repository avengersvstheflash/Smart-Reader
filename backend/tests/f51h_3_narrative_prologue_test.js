const assert = require('assert');
const documentStructureEngine = require('../services/structure/documentStructureEngine');
const sectionFilter = require('../services/synthesis/sectionFilter');
const { getDatabase } = require('../db/database');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const editorialService = require('../services/synthesis/editorialService');

console.log('================================================================');
console.log('🧪 RUNNING F51h.3 NARRATIVE PROLOGUE & EPILOGUE TESTS');
console.log('================================================================\n');

// -------------------------------------------------------------
// T1: classifyRoleFromTitle classifies Prologue & Epilogue as chapter
// -------------------------------------------------------------
console.log('T1 — classifyRoleFromTitle classifies Prologue & Epilogue as chapter');
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Prologue'),
  'chapter',
  'Prologue must be chapter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Prologue Preparing the Perfect Stage!'),
  'chapter',
  'Prologue with subtitle must be chapter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Epilogue'),
  'chapter',
  'Epilogue must be chapter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Epilogue: The Return Home'),
  'chapter',
  'Epilogue with subtitle must be chapter'
);
// Real front/back matter apparatus must remain preserved
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Preface'),
  'front_matter',
  'Preface must be front_matter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Foreword'),
  'front_matter',
  'Foreword must be front_matter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Afterword'),
  'back_matter',
  'Afterword must be back_matter'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Appendix'),
  'appendix',
  'Appendix must be appendix'
);
assert.strictEqual(
  documentStructureEngine.classifyRoleFromTitle('Index'),
  'index',
  'Index must be index'
);
console.log('  ✓ Passed: classifyRoleFromTitle correctly classifies narrative vs apparatus\n');

// -------------------------------------------------------------
// T2: buildChaptersFromToc assigns structural_role='chapter' to Prologue and Epilogue
// -------------------------------------------------------------
console.log('T2 — buildChaptersFromToc assigns structural_role=chapter to Prologue & Epilogue');
const toc = [
  { level: 1, title: 'Preface', page: 1 },
  { level: 1, title: 'Prologue: Preparing the Perfect Stage!', page: 2 },
  { level: 1, title: 'Chapter 1: The Shadowbroker Tutorial', page: 3 },
  { level: 1, title: 'Epilogue: Whispers in the Dark', page: 4 },
  { level: 1, title: 'Afterword', page: 5 },
];
const blocks = [
  { text: 'Author preface discussing the writing process.', sourcePage: 1 },
  { text: 'I trained my body on Earth seeking magic.', sourcePage: 2 },
  { text: 'Three years later, Shadow Garden was formed.', sourcePage: 3 },
  { text: 'The aftermath of the battle.', sourcePage: 4 },
  { text: 'Thank you to my illustrator and readers.', sourcePage: 5 },
];
const chapters = documentStructureEngine.buildChaptersFromToc(toc, blocks, { title: 'Test Novel' });
assert.ok(chapters, 'buildChaptersFromToc should succeed');
assert.strictEqual(chapters.length, 5, 'Should have 5 chapters');
assert.strictEqual(chapters[0].title, 'Preface');
assert.strictEqual(chapters[0].structural_role, 'front_matter', 'Preface must be front_matter');
assert.strictEqual(chapters[1].title, 'Prologue: Preparing the Perfect Stage!');
assert.strictEqual(chapters[1].structural_role, 'chapter', 'Prologue must be chapter');
assert.strictEqual(chapters[2].title, 'Chapter 1: The Shadowbroker Tutorial');
assert.strictEqual(chapters[2].structural_role, 'chapter', 'Chapter 1 must be chapter');
assert.strictEqual(chapters[3].title, 'Epilogue: Whispers in the Dark');
assert.strictEqual(chapters[3].structural_role, 'chapter', 'Epilogue must be chapter');
assert.strictEqual(chapters[4].title, 'Afterword');
assert.strictEqual(chapters[4].structural_role, 'back_matter', 'Afterword must be back_matter');
console.log('  ✓ Passed: buildChaptersFromToc preserves Prologue & Epilogue as chapter\n');

// -------------------------------------------------------------
// T3: sectionFilter allows Prologue and Epilogue sections as valid candidates
// -------------------------------------------------------------
console.log('T3 — sectionFilter allows Prologue and Epilogue sections as candidates');
const prologueSection = {
  sectionTitle: 'Prologue: Preparing the Perfect Stage!',
  sectionType: 'paragraph',
  structuralRole: 'chapter',
  wordCount: 500,
  summary: 'Minoru Kagenou trains on Earth seeking absolute magic and gets hit by a truck.',
};
const epilogueSection = {
  sectionTitle: 'Epilogue: Whispers in the Dark',
  sectionType: 'paragraph',
  structuralRole: 'chapter',
  wordCount: 400,
  summary: 'Cid reflects on his shadow persona while Alpha departs.',
};
const prefaceSection = {
  sectionTitle: 'Preface',
  sectionType: 'paragraph',
  structuralRole: 'front_matter',
  wordCount: 300,
  summary: 'Author acknowledgments and preface notes.',
};

const filterPrologue = sectionFilter.evaluateSection(prologueSection);
assert.strictEqual(filterPrologue.isCandidate, true, 'Prologue must be an editorial candidate');

const filterEpilogue = sectionFilter.evaluateSection(epilogueSection);
assert.strictEqual(filterEpilogue.isCandidate, true, 'Epilogue must be an editorial candidate');

const filterPreface = sectionFilter.evaluateSection(prefaceSection);
assert.strictEqual(filterPreface.isCandidate, false, 'Preface must not be an editorial candidate');
console.log('  ✓ Passed: sectionFilter correctly retains narrative Prologue & Epilogue\n');

// -------------------------------------------------------------
// T4: Live Database Verification on The Eminence in Shadow (book-1791822740455-acmd4)
// -------------------------------------------------------------
console.log('T4 — Live DB: reclassify Prologue in Eminence in Shadow to chapter');
const db = getDatabase(); // triggers startup migration
const bookId = 'book-1791822740455-acmd4';
const ch6 = db.prepare('SELECT id, number, title, structural_role FROM chapters WHERE id = ?').get('ch-book-1791822740455-acmd4-6-oxv7');

if (ch6) {
  assert.strictEqual(ch6.structural_role, 'chapter', 'Chapter 6 in DB must now be structural_role: chapter');
  const ch6Chunks = db.prepare('SELECT count(*) as count, structural_role FROM semantic_chunks WHERE chapter_id = ? GROUP BY structural_role').all('ch-book-1791822740455-acmd4-6-oxv7');
  assert.ok(ch6Chunks.length > 0, 'Chapter 6 must have chunks');
  for (const group of ch6Chunks) {
    assert.strictEqual(group.structural_role, 'chapter', 'All chunks of Chapter 6 must have structural_role: chapter');
  }
  console.log(`  ✓ Passed: Chapter 6 (${ch6.title}) and its ${ch6Chunks[0].count} chunks are classified as 'chapter'`);

  // Verify that semanticChunkRepository.getByBookId contains these chunks with role 'chapter'
  const bookChunks = semanticChunkRepository.getByBookId(bookId);
  const ch6Retrieved = bookChunks.filter(c => c.chapterId === ch6.id);
  assert.strictEqual(ch6Retrieved.length, 25, 'All 25 Prologue chunks present');
  assert.strictEqual(ch6Retrieved.every(c => c.structuralRole === 'chapter'), true, 'All 25 Prologue chunks have structuralRole chapter');
  console.log(`  ✓ Passed: semanticChunkRepository returns all 25 Prologue chunks with structuralRole: chapter\n`);
} else {
  console.log('  (Skipping T4 live check: book-1791822740455-acmd4 not in test DB)');
}

console.log('================================================================');
console.log('🎉 ALL F51h.3 NARRATIVE PROLOGUE & EPILOGUE TESTS PASSED');
console.log('================================================================\n');
