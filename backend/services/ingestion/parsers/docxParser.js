const parseClient = require('../../ai/parseClient');
const documentStructureAnalyzer = require('../structure/documentStructureAnalyzer');

function mapParsedToCanonical(parsedBlocks) {
  return parsedBlocks.map(b => {
    if (b.kind === 'heading') return { id: `blk-${Date.now()}-${Math.random().toString(36).substring(2,7)}`, type: 'heading', level: b.level || 1, text: b.text };
    if (b.kind === 'table') return { id: `blk-${Date.now()}-${Math.random().toString(36).substring(2,7)}`, type: 'table', rows: b.rows };
    return { id: `blk-${Date.now()}-${Math.random().toString(36).substring(2,7)}`, type: 'paragraph', text: b.text };
  });
}

class DocxParser {
  async parse(buffer, options = {}) {
    const parsed = await parseClient.parseDocx(buffer, options);
    const blocks = mapParsedToCanonical(parsed.blocks || []);
    const analysis = documentStructureAnalyzer.analyze({
      format: 'docx',
      blocks,
      rawText: blocks.map(b => b.text || '').join('\n\n'),
      metadata: {
        title: parsed.title || options.title || 'Untitled Document',
        author: parsed.author || options.author || 'Unknown Author',
      },
    });
    return {
      title: parsed.title || analysis.chapters[0]?.title || 'Untitled Document',
      author: parsed.author || 'Unknown Author',
      chapters: analysis.chapters,
      totalWordCount: analysis.totalWordCount,
      tablesCount: blocks.filter(b => b.type === 'table').length,
      sectionCount: analysis.sectionCount || 0,
      integrityStatus: analysis.totalWordCount === 0 ? 'empty_content' : 'valid',
      integrityWarning: analysis.totalWordCount === 0 ? 'DOCX contained no readable text.' : '',
    };
  }
}
module.exports = new DocxParser();
