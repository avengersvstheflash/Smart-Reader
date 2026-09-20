class ContextBuilder {
  constructor(options = {}) {
    this.defaultMaxTokens = options.defaultMaxTokens || 4000;
  }

  buildRetrievalContext(retrievalResult, options = {}) {
    const maxTokens = options.maxTokens || this.defaultMaxTokens;
    const purpose = options.purpose || 'general'; // 'synopsis' | 'book_summary' | 'chapter_summary' | 'qa'

    const chunks = retrievalResult.chunks || [];
    let accumulatedTokens = 0;
    const includedChunks = [];

    // Header context
    let contextHeader = '';
    if (retrievalResult.book) {
      contextHeader += `DOCUMENT METADATA:\n`;
      contextHeader += `• Title: ${retrievalResult.book.title}\n`;
      if (retrievalResult.book.author) contextHeader += `• Author: ${retrievalResult.book.author}\n`;
      if (retrievalResult.book.contentType) contextHeader += `• Type: ${retrievalResult.book.contentType}\n`;
      contextHeader += `\n`;
    }

    if (retrievalResult.chapter) {
      contextHeader += `ACTIVE CHAPTER: Chapter ${retrievalResult.chapter.number}: ${retrievalResult.chapter.title}\n\n`;
    }

    // Build excerpt blocks with provenance
    const excerptBlocks = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTokens = chunk.tokenCount || Math.ceil((chunk.textContent || '').length / 4);

      if (accumulatedTokens + chunkTokens > maxTokens && includedChunks.length > 0) {
        break;
      }

      const provenanceRef = chunk.sourceReference || (chunk.sectionHeading ? `Section: ${chunk.sectionHeading}` : `Excerpt ${i + 1}`);
      const typeLabel = (chunk.contentType || 'text').toUpperCase();

      const blockStr = `[SOURCE EXCERPT ${i + 1} | ${typeLabel} | ${provenanceRef}]\n${chunk.textContent}\n`;
      excerptBlocks.push(blockStr);
      includedChunks.push({
        id: chunk.id,
        sourceReference: provenanceRef,
        contentType: chunk.contentType,
        sequence: chunk.sequence,
        similarityScore: chunk.similarityScore,
      });

      accumulatedTokens += chunkTokens;
    }

    const fullContextText = `${contextHeader}GROUNDED SOURCE MATERIAL:\n${excerptBlocks.join('\n---\n\n')}`;

    const contentType = (retrievalResult.book && (retrievalResult.book.contentType || retrievalResult.book.content_type)) || options.contentType || 'work';
    const groundingPrompt = this.getGroundingInstructions(purpose, contentType);

    return {
      contextText: fullContextText,
      groundingPrompt,
      includedChunks,
      tokenCount: Math.ceil(fullContextText.length / 4),
      chunkCount: includedChunks.length,
    };
  }

  getGroundingInstructions(purpose, contentType = 'work') {
    const base = `GROUNDING DIRECTIVE:
You are an editorial intelligence engine for Smart Reader.
Strictly adhere to the following rules:
1. Base all facts, assertions, events, concepts, and analyses STRICTLY on the provided source material.
2. If the provided excerpts do not contain sufficient evidence to answer or establish a point, explicitly state the limitation.
3. Do NOT hallucinate plot points, character actions, scientific results, or definitions not present in the text.
4. Output your analysis in clean, structured editorial prose without leaking raw markdown tags or unformatted blocks.
5. Do NOT output raw HTML tags (such as <strong>, <em>, <b>, <i>, <p>, <br>). Write standard markdown.
6. Do NOT output empty markdown markers (such as ### or *** alone).
7. Avoid generic boilerplate phrasing (e.g. "this work investigates foundational methodologies", "this document establishes"). Ground every sentence in the concrete subject matter.`;

    if (purpose === 'synopsis') {
      return `${base}

SPECIFIC TASK: EDITORIAL SYNOPSIS (${contentType.toUpperCase()})
Provide a concise, high-level editorial synopsis answering: "What is this material fundamentally about?"
Deliver:
- Core premise, central inquiry, key tension, or subject matter.
- Concise orientation (1-2 focused, elegant paragraphs).
- Grounded in the opening and foundational sections.
- Do NOT produce an itemized chapter-by-chapter recap or giant bullet lists.`;
    }

    if (purpose === 'book_summary') {
      return `${base}

SPECIFIC TASK: COMPREHENSIVE MULTI-CHAPTER SUMMARY (${contentType.toUpperCase()})
Provide a deep, structured summary that synthesizes the entire document architecture:
- Core Premise & System Framework
- Conceptual Progression & Evidence Across Chapters
- Primary Takeaways & Conclusions
Structure with clear markdown headings (## or ###) and substantive paragraphs.`;
    }

    if (purpose === 'chapter_summary') {
      return `${base}

SPECIFIC TASK: CHAPTER SUMMARY
Provide a structured synthesis of this specific chapter:
- Chapter Focus & Central Progression
- Key Concepts or Narrative Turning Points
- Core Takeaways`;
    }

    if (purpose === 'qa') {
      return `${base}

SPECIFIC TASK: GROUNDED QUESTION ANSWERING
Answer the reader's question directly and concisely, citing the specific source sections that substantiate your response.`;
    }

    return base;
  }

  buildSynthesisContext(outlineChapter, retrievedChunks = []) {
    const chapterTitle = typeof outlineChapter === 'string'
      ? outlineChapter
      : (outlineChapter && outlineChapter.title ? outlineChapter.title : 'Editorial Synthesis');

    const chunks = Array.isArray(retrievedChunks) ? retrievedChunks : [];
    const sourceBlocks = [];
    const includedChunks = [];

    let bookRepository = null;
    let chapterRepository = null;
    try {
      bookRepository = require('../../repositories/bookRepository');
      chapterRepository = require('../../repositories/chapterRepository');
    } catch {}

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const sourceNum = i + 1;

      let bookTitle = chunk.bookTitle || chunk.book_title;
      const bId = chunk.bookId || chunk.book_id;
      if (!bookTitle && bId && bookRepository) {
        const b = bookRepository.getById(bId);
        if (b) bookTitle = b.title;
      }
      if (!bookTitle) bookTitle = `Book ${bId || sourceNum}`;

      let chapterTitle = chunk.chapterTitle || chunk.chapter_title;
      const chId = chunk.chapterId || chunk.chapter_id;
      if (!chapterTitle && chId && chapterRepository) {
        const ch = chapterRepository.getById(chId);
        if (ch) chapterTitle = ch.title;
      }
      if (!chapterTitle) chapterTitle = chId ? `Chapter ${chId}` : `Chapter ${sourceNum}`;

      const sectionTitle = chunk.sectionHeading || chunk.section_heading || chunk.heading || chunk.sourceReference || `Section ${sourceNum}`;
      const textContent = chunk.textContent || chunk.content || chunk.text_content || '';

      const header = `[Source ${sourceNum}: ${bookTitle}, ${chapterTitle}, ${sectionTitle}]`;
      sourceBlocks.push(`${header}\n${textContent}`);

      includedChunks.push({
        id: chunk.id || chunk.chunkId,
        sourceNumber: sourceNum,
        bookId: bId,
        bookTitle,
        chapterId: chId,
        chapterTitle,
        sectionHeading: sectionTitle,
        textContent,
      });
    }

    const sourceMaterialText = sourceBlocks.length > 0 ? sourceBlocks.join('\n\n') : 'No source excerpts retrieved.';
    const instructionsText = `INSTRUCTIONS: Compress, do not summarize or concatenate. Preserve every distinct concept, argument, and factual claim. Preserve uncertainty. Cite sources inline using [Source N].`;

    const fullContextText = `EDITORIAL TASK: Compress chapter "${chapterTitle}".

SOURCE MATERIAL:
${sourceMaterialText}

${instructionsText}`;

    return {
      contextText: fullContextText,
      sourceMaterialText,
      instructions: instructionsText,
      editorialTask: `EDITORIAL TASK: Compress chapter "${chapterTitle}".`,
      outlineChapter: typeof outlineChapter === 'object' ? outlineChapter : { title: chapterTitle },
      includedChunks,
      chunkCount: includedChunks.length,
      tokenCount: Math.ceil(fullContextText.length / 4),
      toString() {
        return fullContextText;
      },
      includes(substr) {
        return fullContextText.includes(substr);
      },
    };
  }
}

module.exports = new ContextBuilder();
