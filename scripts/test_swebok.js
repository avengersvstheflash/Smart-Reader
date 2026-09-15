const fs = require('fs');
const path = require('path');
const pdfjsParser = require('../backend/services/ingestion/parsers/pdfjsParser');

async function testSwebok() {
  const filePath = 'C:/Users/Godsa/Downloads/swebok-v4.pdf';
  console.log('Reading SWEBOK v4 from: ' + filePath);
  const buffer = fs.readFileSync(filePath);
  
  const startTime = Date.now();
  console.log('Starting parse...');
  const result = await pdfjsParser.parse(buffer, {
    title: 'Guide to the Software Engineering Body of Knowledge (SWEBOK Guide v4)',
    originalFilename: 'swebok-v4.pdf',
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Parsed in ${elapsed}s! Total pages: ${result.pageCount}`);
  console.log(`Total structures: ${result.chapters.length}`);
  console.log(`Total words: ${result.totalWordCount}`);
  console.log('\n--- DETECTED STRUCTURES ---');
  for (const ch of result.chapters) {
    console.log(`  - [${(ch.structuralRole || 'unknown').toUpperCase()}] "${ch.title}" (${ch.wordCount} words, ${ch.sectionCount || 0} sections, pages ${ch.startPage}–${ch.endPage})`);
  }
}

testSwebok().catch((err) => {
  console.error('Error parsing SWEBOK:', err);
});
