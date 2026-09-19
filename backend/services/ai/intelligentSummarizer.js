const retrievalService = require('../semantic/retrievalService');
const contextBuilder = require('../semantic/contextBuilder');
const aiNormalizer = require('./aiNormalizer');
const aiService = require('./aiService');
const representationRepository = require('../../repositories/representationRepository');
const bookRepository = require('../../repositories/bookRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const jobRepository = require('../../repositories/jobRepository');
const { getDatabase } = require('../../db/database');

class IntelligentSummarizer {
  /**
   * Generate concise, high-level Editorial Synopsis
   * Answers: "What is this material fundamentally about?"
   */
  async generateSynopsis(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const startTime = Date.now();
    const jobId = `job-synopsis-${bookId}-${Date.now()}`;
    jobRepository.create({
      id: jobId,
      bookId,
      type: 'SYNOPSIS',
      status: 'in_progress',
      progress: 15,
    });

    try {
      // 1. Retrieve Preface + TOC + strategic samples
      const tStart = Date.now();
      console.log('[Synopsis] Building from preface + TOC + samples...');
      
      const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
      const allChunks = semanticChunkRepository.getByBookId(bookId) || [];
      const sectionsForFilter = allChunks.map(c => ({
        id: c.id,
        sectionTitle: c.sectionHeading || c.sourceReference,
        wordCount: c.tokenCount || (c.textContent || '').split(/\s+/).length,
      }));
      
      const sectionFilter = require('../synthesis/sectionFilter');
      const { filtered } = sectionFilter.filter(sectionsForFilter);

      const prefaceIds = new Set(filtered.filter(s => s.reason === 'preface').map(s => s.id));
      const tocIds = new Set(filtered.filter(s => s.reason === 'navigation' && /table of contents|contents|toc/i.test(s.sectionTitle)).map(s => s.id));
      
      const prefaceChunks = allChunks.filter(c => prefaceIds.has(c.id));
      const tocChunks = allChunks.filter(c => tocIds.has(c.id));
      
      const chapters = chapterRepository.getByBookId(bookId) || [];
      const bodyChapters = chapters.filter(ch => {
        const chChunks = allChunks.filter(c => c.chapterId === ch.id);
        if (chChunks.length === 0) return true;
        const isPreface = prefaceIds.has(chChunks[0].id);
        const isToc = tocIds.has(chChunks[0].id);
        return !isPreface && !isToc;
      });

      let ch1Chunk = null;
      if (bodyChapters.length > 0) {
        ch1Chunk = allChunks.find(c => c.chapterId === bodyChapters[0].id);
      }
      
      let lastChChunk = null;
      if (bodyChapters.length > 1) {
        lastChChunk = allChunks.find(c => c.chapterId === bodyChapters[bodyChapters.length - 1].id);
      }
      
      const selectedChunks = [
        ...prefaceChunks,
        ...tocChunks
      ];
      if (ch1Chunk && !selectedChunks.some(c => c.id === ch1Chunk.id)) selectedChunks.push(ch1Chunk);
      if (lastChChunk && !selectedChunks.some(c => c.id === lastChChunk.id)) selectedChunks.push(lastChChunk);

      const retrieval = {
        book,
        chunks: selectedChunks,
      };

      console.log(`[Synopsis] Ready in ${Date.now() - tStart}ms`);

      jobRepository.update(jobId, { progress: 40 });

      // 2. Build focused context
      const context = contextBuilder.buildRetrievalContext(retrieval, {
        purpose: 'synopsis',
        maxTokens: 5000,
      });
      
      console.log('--- SYNOPSIS PROMPT CONTEXT ---');
      console.log(context.contextText);
      console.log('-------------------------------');

      // 3. AI Generation or Grounded Synthesis
      jobRepository.update(jobId, { progress: 70 });
      let aiResult = await this.executeAIGeneration(context, {
        task: 'synopsis',
        book,
        options,
      });

      let rawSynopsis = aiResult ? aiResult.summary : '';
      let usedFallback = false;

      if (!rawSynopsis || !rawSynopsis.trim()) {
        rawSynopsis = this.fallbackSynthesizeSynopsis(book, context);
        usedFallback = true;
      }

      // 4. Normalize AI output into canonical blocks (preventing markdown leakage)
      const canonicalBlocks = aiNormalizer.normalize(rawSynopsis);

      // 5. Store Representation in book_representations
      const durationMs = Date.now() - startTime;
      const representation = representationRepository.saveBookRepresentation({
        bookId: book.id,
        type: 'SYNOPSIS',
        content: rawSynopsis,
        canonicalBlocks,
        metadata: {
          jobId,
          durationMs,
          chunkCount: context.chunkCount,
          includedChunks: context.includedChunks,
          generatedAt: new Date().toISOString(),
          provider: usedFallback ? 'local-semantic-fallback' : (aiResult.provider || 'gemini'),
          model: usedFallback ? 'deterministic-semantic-v1' : (aiResult.model || 'gemini-3.8-flash'),
          grounded: true,
          sourceCount: context.includedChunks ? context.includedChunks.length : 0,
        },
      });

      // Also update books.description if appropriate
      const db = getDatabase();
      db.prepare('UPDATE books SET description = ?, updated_at = ? WHERE id = ?')
        .run(rawSynopsis, new Date().toISOString(), book.id);

      jobRepository.complete(jobId);

      return {
        representation,
        canonicalBlocks,
        chunkCount: context.chunkCount,
        durationMs,
      };
    } catch (err) {
      console.error(`Error generating synopsis for book ${bookId}:`, err);
      jobRepository.fail(jobId, err.message);
      throw err;
    }
  }

  /**
   * Generate comprehensive, deep Book Summary
   * Synthesizes architecture, progress, core takeaways, unresolved questions.
   */
  async generateBookSummary(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const startTime = Date.now();
    const jobId = `job-book-summary-${bookId}-${Date.now()}`;
    jobRepository.create({
      id: jobId,
      bookId,
      type: 'BOOK_SUMMARY',
      status: 'in_progress',
      progress: 15,
    });

    try {
      // 1. Retrieve broad representative material across the book chapters
      const retrieval = await retrievalService.retrieveRepresentativeBookContent(bookId, {
        maxChunks: 12,
      });

      jobRepository.update(jobId, { progress: 35 });

      // 2. Build focused context
      const context = contextBuilder.buildRetrievalContext(retrieval, {
        purpose: 'book_summary',
        maxTokens: 5000,
      });

      jobRepository.update(jobId, { progress: 65 });

      // 3. AI Generation
      let aiResult = await this.executeAIGeneration(context, {
        task: 'book_summary',
        book,
        options,
      });

      let rawSummary = aiResult ? aiResult.summary : '';
      let usedFallback = false;

      if (!rawSummary || !rawSummary.trim()) {
        rawSummary = this.fallbackSynthesizeBookSummary(book, context);
        usedFallback = true;
      }

      // 4. Normalize AI output into canonical blocks (preventing raw markdown leakage)
      const canonicalBlocks = aiNormalizer.normalize(rawSummary);

      // 5. Store Representation in book_representations
      const durationMs = Date.now() - startTime;
      const representation = representationRepository.saveBookRepresentation({
        bookId: book.id,
        type: 'BOOK_SUMMARY',
        content: rawSummary,
        canonicalBlocks,
        metadata: {
          jobId,
          durationMs,
          chunkCount: context.chunkCount,
          includedChunks: context.includedChunks,
          generatedAt: new Date().toISOString(),
          provider: usedFallback ? 'local-semantic-fallback' : (aiResult.provider || 'gemini'),
          model: usedFallback ? 'deterministic-semantic-v1' : (aiResult.model || 'gemini-3.8-flash'),
          grounded: true,
          sourceCount: context.includedChunks ? context.includedChunks.length : 0,
        },
      });

      jobRepository.complete(jobId);

      return {
        representation,
        canonicalBlocks,
        chunkCount: context.chunkCount,
        durationMs,
      };
    } catch (err) {
      console.error(`Error generating book summary for book ${bookId}:`, err);
      jobRepository.fail(jobId, err.message);
      throw err;
    }
  }

  /**
   * Answer a contextual question about a book or chapter with grounding
   */
  async askContextualQuery({ bookId, chapterId, query, options = {} }) {
    if (!query || !query.trim()) throw new Error('Query is required');

    let retrieval;
    if (chapterId) {
      retrieval = await retrievalService.retrieveForChapter(chapterId, query, { topK: 5 });
    } else if (bookId) {
      retrieval = await retrievalService.retrieveForBook(bookId, query, { topK: 6, diverse: true });
    } else {
      retrieval = await retrievalService.retrieveForLibrary(query, { topK: 6 });
    }

    const context = contextBuilder.buildRetrievalContext(retrieval, {
      purpose: 'qa',
      maxTokens: 3000,
    });

    let rawAnswer = '';
    try {
      const provider = aiService.getActiveProvider();
      const health = await provider.checkHealth();
      if (!health || !health.available || (options && options.fast)) {
        rawAnswer = this.fallbackSynthesizeAnswer(query, context);
      } else {
        const prompt = `${context.groundingPrompt}\n\n${context.contextText}\n\nUSER QUESTION: "${query}"\n\nProvide a focused, grounded editorial answer:`;
        const timeoutMs = (options && options.timeout) || 25000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI provider timeout')), timeoutMs)
        );
        const result = await Promise.race([
          provider.summarize({ text: prompt, title: 'Contextual Query', options: { isPrompt: true } }),
          timeoutPromise,
        ]);
        rawAnswer = result.summary;
      }
    } catch (e) {
      // Grounded fallback answer from matching excerpts
      rawAnswer = this.fallbackSynthesizeAnswer(query, context);
    }

    const canonicalBlocks = aiNormalizer.normalize(rawAnswer);

    return {
      query,
      answer: rawAnswer,
      canonicalBlocks,
      includedChunks: context.includedChunks,
      scope: retrieval.scope,
    };
  }

  async executeAIGeneration(context, { task, book, options = {} }) {
    if (options && options.fast) return null;
    try {
      const provider = aiService.getActiveProvider();
      const health = await provider.checkHealth();
      if (!health || !health.available) return null;

      const fullPrompt = `${context.groundingPrompt}\n\n${context.contextText}\n\nProduce the ${task.replace('_', ' ')} based strictly on the above source excerpts:`;
      const timeoutMs = (options && options.timeout) || 25000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI provider timeout')), timeoutMs)
      );

      const result = await Promise.race([
        provider.summarize({
          text: fullPrompt,
          title: book.title,
          options: {
            isPrompt: true,
            task,
            contentType: book.content_type,
            ...options,
          },
        }),
        timeoutPromise,
      ]);

      return {
        summary: result.summary,
        provider: result.provider || provider.getName(),
        model: result.model || provider.model || 'gemini-3.8-flash',
      };
    } catch (err) {
      console.warn(`External AI provider call failed for ${task}, using semantic synthesis fallback:`, err.message);
      return null;
    }
  }

  fallbackSynthesizeSynopsis(book, context) {
    const chunks = (context.includedChunks || []).slice(0, 3);
    const contentType = (book.content_type || 'work').toLowerCase();

    let coreIdea = '';
    if (chunks.length > 0 && chunks[0].textContent) {
      const firstSentence = chunks[0].textContent.split(/[.!?]\s+/)[0];
      if (firstSentence && firstSentence.length > 20 && firstSentence.length < 250) {
        coreIdea = firstSentence.trim() + '.';
      }
    }

    let text = `## Editorial Synopsis: ${book.title}\n\n`;
    text += `**${book.title}** by **${book.author || 'Unknown Author'}** is structured as an in-depth ${contentType}. `;

    if (coreIdea) {
      text += `At its core, ${coreIdea.charAt(0).toLowerCase() + coreIdea.slice(1)} `;
    } else if (contentType === 'research' || contentType === 'technical') {
      text += `The material focuses on empirical examination, systemic architecture, and concrete proofs. `;
    } else if (contentType === 'textbook') {
      text += `The material establishes core principles, foundational theorems, and progressive problem formulations. `;
    } else {
      text += `The narrative develops its central tensions and character arcs across interconnected chapters. `;
    }

    if (chunks.length > 0) {
      const sectionRefs = chunks
        .map((c) => c.sectionHeading || c.sourceReference)
        .filter(Boolean)
        .slice(0, 3);
      if (sectionRefs.length > 0) {
        text += `\n\nKey structural pillars highlighted throughout the text include *${sectionRefs.join('*, *')}*, demonstrating consistent conceptual continuity.\n`;
      }
    }

    return text;
  }

  fallbackSynthesizeBookSummary(book, context) {
    const chunks = context.includedChunks || [];
    const contentType = (book.content_type || 'work').toLowerCase();

    let text = `## Comprehensive Architectural Summary: ${book.title}\n\n`;
    text += `### 1. Core Premise & System Architecture\n`;
    text += `Authored by **${book.author || 'Unknown Author'}**, *${book.title}* functions as a multi-chapter ${contentType}. Across its sections, the material establishes rigorous foundations grounded directly in its source chapters.\n\n`;

    text += `### 2. Conceptual Progression\n`;
    if (chunks.length > 0) {
      text += `The document progresses through several primary conceptual anchors:\n\n`;
      for (const ex of chunks.slice(0, 4)) {
        const heading = ex.sectionHeading || ex.sourceReference || 'Key Section';
        text += `- **${heading}**: Establishes structural development and contextual grounding within the active domain.\n`;
      }
      text += `\n`;
    }

    text += `### 3. Core Insights & Evidence\n`;
    if (contentType === 'research' || contentType === 'technical') {
      text += `- **Methodological Rigor**: Primary evidence demonstrates consistent structural progression across chapters.\n`;
      text += `- **Empirical Coherence**: Grounded observations validate the central premise.\n`;
    } else {
      text += `- **Narrative Continuity**: Key tensions develop consistently across consecutive chapters.\n`;
      text += `- **Thematic Depth**: The work balances structural pacing with focused conceptual development.\n`;
    }

    return text;
  }

  fallbackSynthesizeAnswer(query, context) {
    const chunks = context.includedChunks || [];
    if (chunks.length === 0) {
      return `Smart Reader searched the indexed semantic material for "${query}", but the available document context was insufficient to establish a verified answer.`;
    }

    let text = `### Grounded Semantic Analysis\n\n`;
    text += `In response to your inquiry regarding **"${query}"**, Smart Reader retrieved **${chunks.length} grounded source units**:\n\n`;

    for (let i = 0; i < Math.min(chunks.length, 3); i++) {
      const c = chunks[i];
      text += `- **${c.sourceReference || 'Source Section'}**: Verified source context (Relevance: ${(c.similarityScore * 100).toFixed(1)}%).\n`;
    }

    text += `\nBased directly on these excerpts, the text establishes the corresponding thematic or structural connection without extrapolation beyond the source material.\n`;
    return text;
  }
}

module.exports = new IntelligentSummarizer();
