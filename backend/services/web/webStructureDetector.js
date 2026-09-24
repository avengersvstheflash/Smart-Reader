const documentStructureAnalyzer = require('../ingestion/structure/documentStructureAnalyzer');

/**
 * Web Structure Detector for Smart Reader
 * Delegates structure analysis to DocumentStructureAnalyzer to ensure
 * consistency across PDF, EPUB, Markdown, Text, and Web pipelines.
 */
class WebStructureDetector {
  /**
   * Structures canonical blocks into chapters
   * @param {CanonicalDocument} canonicalDoc
   * @param {object} metadata
   * @returns {Array<{ number: number, title: string, structuralRole: string, canonicalBlocks: Array<object>, sections: Array<object>, sectionCount: number, content: string, wordCount: number, metadata?: object }>}
   */
  structure(canonicalDoc, metadata = {}) {
    const blocks = canonicalDoc ? canonicalDoc.getBlocks() : [];
    const analysis = documentStructureAnalyzer.analyze({
      format: 'web',
      blocks,
      metadata,
    });
    return analysis.chapters || [];
  }
}

module.exports = new WebStructureDetector();
