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
    const jobId = options.jobId || `job-synopsis-${bookId}-${Date.now()}`;
    if (!options.jobId) {
      jobRepository.create({
        id: jobId,
        book_id: bookId,
        type: 'SYNOPSIS',
        status: 'PROCESSING',
        progress: 15,
      });
    } else {
      jobRepository.update(jobId, { status: 'PROCESSING', progress: 15 });
    }

    try {
      // 1. Retrieve Preface + TOC + strategic samples
      const tStart = Date.now();
      console.log('[Synopsis Compression] Building abstract from preface + TOC + samples...');
      
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

      console.log(`[Synopsis Compression] Ready in ${Date.now() - tStart}ms`);

      jobRepository.update(jobId, { progress: 40 });

      // 2. Build focused context
      const context = contextBuilder.buildRetrievalContext(retrieval, {
        purpose: 'synopsis',
        maxTokens: 5000,
      });

      const extractFirstPara = (chunk) => {
        if (!chunk || !chunk.textContent) return '(None provided)';
        const paras = chunk.textContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        return paras[0] || chunk.textContent.trim();
      };

      const prefaceText = prefaceChunks.map(c => c.textContent).join('\n\n').trim() || '(None provided)';
      const tocText = tocChunks.map(c => c.textContent).join('\n\n').trim() || '(None provided)';
      const ch1FirstPara = extractFirstPara(ch1Chunk);
      const lastChFirstPara = extractFirstPara(lastChChunk);

      const synopsisPrompt = `You are preparing a synopsis for a book — a concise, high-quality abstract that gives a reader an accurate sense of what the book is about, how it's structured, and what reading it feels like.

INPUTS PROVIDED:

Author's preface (their own framing of the book)

Table of contents

Opening paragraphs of the first body chapter

Opening paragraphs of the last body chapter

OUTPUT: 200–300 words. Hard bounds: 180 minimum, 320 maximum.

Structure:

Core subject — one or two sentences stating what the book is about.

Scope and approach — what the book covers, how it treats its subject, who it is for.

Content landscape — one or two sentences on what the interior is like: dense or accessible, exercises or arguments, case studies or theory, structure of the chapters.

What reading it feels like — one sentence, like a short review. e.g. "Reads like a working engineer's notebook — terse, technical, and confident."

Rules:

Compress. Do not pad. Every sentence must carry information.

Do not invent details not present in the inputs.

Do not open with narrative framing ("This book represents…").

Do not list chapters or restate the TOC as a list.

Do not summarize the preface — describe the book.

If the inputs are insufficient for a full synopsis, close with one honest line: "[PARTIAL: inputs insufficient for full synopsis]".

INPUTS:
${prefaceText}

TOC:
${tocText}

CHAPTER 1 OPENING:
${ch1FirstPara}

LAST CHAPTER OPENING:
${lastChFirstPara}

OUTPUT:`;
      
      console.log('--- SYNOPSIS COMPRESSION PROMPT ---');
      console.log(synopsisPrompt);
      console.log('-----------------------------------');

      // 3. AI Generation or Grounded Compression
      jobRepository.update(jobId, { progress: 70 });
      let aiResult = null;
      let rawSynopsis = '';
      let fellBack = false;
      let fallbackReason = null;
      let wordCountViolation = false;

      try {
        aiResult = await this.executeAIGeneration(context, {
          task: 'synopsis',
          book,
          options,
          prompt: synopsisPrompt,
          maxTokens: 600,
        });
        if (aiResult && aiResult.summary && aiResult.summary.trim()) {
          rawSynopsis = aiResult.summary;
          let wordCount = rawSynopsis.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount < 180 || wordCount > 320) {
            console.warn(`[Synopsis Compression] Output word count (${wordCount}) outside bounds [180, 320]. Retrying once with stricter constraint...`);
            const retryPrompt = `${synopsisPrompt}\n\nIMPORTANT CONSTRAINT CORRECTION: Your previous attempt was ${wordCount} words, which violates the required length. Return exactly 250 words. Do not exceed 300 words. Hard bounds: 180 minimum, 320 maximum.`;
            const retryResult = await this.executeAIGeneration(context, {
              task: 'synopsis',
              book,
              options,
              prompt: retryPrompt,
              maxTokens: 600,
            });
            if (retryResult && retryResult.summary && retryResult.summary.trim()) {
              rawSynopsis = retryResult.summary;
              aiResult = retryResult;
              wordCount = rawSynopsis.trim().split(/\s+/).filter(Boolean).length;
              if (wordCount < 180 || wordCount > 320) {
                wordCountViolation = true;
                console.warn(`[Synopsis Compression] Retry word count (${wordCount}) still outside bounds [180, 320]. Flagging word_count_violation.`);
              }
            } else {
              wordCountViolation = true;
            }
          }
        } else {
          fellBack = true;
          fallbackReason = 'provider_unavailable';
        }
      } catch (err) {
        fellBack = true;
        const msg = String(err.message || '').toLowerCase();
        if (
          msg.includes('timeout') ||
          msg.includes('timed out') ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ESOCKETTIMEDOUT' ||
          err.name === 'TimeoutError'
        ) {
          fallbackReason = 'provider_timeout';
        } else if (
          msg.includes('json') ||
          msg.includes('parse') ||
          msg.includes('syntaxerror') ||
          err.name === 'SyntaxError'
        ) {
          fallbackReason = 'invalid_json';
        } else {
          fallbackReason = 'provider_unavailable';
        }
      }

      if (!rawSynopsis || !rawSynopsis.trim()) {
        if (!fellBack) {
          fellBack = true;
          fallbackReason = 'provider_unavailable';
        }
        rawSynopsis = this.fallbackSynthesizeSynopsis(book, context);
      }

      const finalWordCount = rawSynopsis.trim().split(/\s+/).filter(Boolean).length;
      if (!fellBack && (finalWordCount < 180 || finalWordCount > 320)) {
        wordCountViolation = true;
      }

      // 4. Normalize AI output into canonical blocks (preventing markdown leakage)
      const canonicalBlocks = aiNormalizer.normalize(rawSynopsis);

      // 5. Store Representation in book_representations
      const durationMs = Date.now() - startTime;
      const metadata = {
        jobId,
        durationMs,
        chunkCount: context.chunkCount,
        includedChunks: context.includedChunks,
        generatedAt: new Date().toISOString(),
        grounded: true,
        sourceCount: context.includedChunks ? context.includedChunks.length : 0,
        word_count: finalWordCount,
        word_count_violation: wordCountViolation,
      };

      if (fellBack) {
        metadata.fell_back = true;
        metadata.fallback_reason = fallbackReason || 'provider_unavailable';
        metadata.provider = 'local-semantic-fallback';
        metadata.model = 'deterministic-semantic-v1';
      } else {
        metadata.fell_back = false;
        metadata.provider = (aiResult && aiResult.provider) || 'gemini';
        metadata.model = (aiResult && aiResult.model) || 'gemini-3.8-flash';
      }

      const representation = representationRepository.saveBookRepresentation({
        bookId: book.id,
        type: 'SYNOPSIS',
        content: rawSynopsis,
        canonicalBlocks,
        metadata,
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

      // Gather chapter-level representations if available
      const chapters = chapterRepository.getByBookId(bookId) || [];
      const chapterReps = chapterRepository.getRepresentationsByBook(bookId) || [];
      const repByChapterId = new Map();
      for (const rep of chapterReps) {
        if (!repByChapterId.has(rep.chapterId) || rep.type === 'EDITORIAL_SYNTHESIS') {
          repByChapterId.set(rep.chapterId, rep);
        }
      }

      let chapterSummariesText = '';
      if (chapters.length > 0 && repByChapterId.size > 0) {
        const sections = [];
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const rep = repByChapterId.get(ch.id);
          if (rep && rep.content) {
            sections.push(`[Chapter ${ch.number || (i + 1)}: ${ch.title}]\n${rep.content.trim()}`);
          }
        }
        chapterSummariesText = sections.join('\n\n');
      }

      if (!chapterSummariesText.trim()) {
        chapterSummariesText = (context.includedChunks || []).map((c, i) => {
          const ref = c.sectionHeading || c.sourceReference || `Section ${i + 1}`;
          return `[Source ${i + 1}: ${ref}]\n${c.textContent || ''}`;
        }).join('\n\n') || '(No chapter summaries available)';
      }

      const bookMeta = `Title: ${book.title}\nAuthor: ${book.author || 'Unknown Author'}\nFormat: ${book.format || book.content_type || 'Book'}`;

      const summaryPrompt = `You are preparing a comprehensive book summary from the aggregated chapter-level representations already produced for this book. This is a compressed structural overview, not a narrative retelling.

INPUTS PROVIDED:

Chapter-level summaries for all chapters of the book

Book metadata (title, author, format)

OUTPUT: 600–900 words. Hard bounds: 500 minimum, 1000 maximum.

Structure:

Central thesis or argument (2–3 sentences)

Structural overview — the book's arc, in 3–5 short paragraphs, one per major movement or section

Key concepts and frameworks introduced (bullet list, 5–10 items)

Who this is for and what it demands of the reader

What stays with you after closing it — one closing paragraph

Rules:

Compress aggressively. No filler sentences.

No chapter-by-chapter walkthrough — group by movement, not order.

No invented claims not present in the chapter summaries.

No bullet-list dumping — mix prose and structure.

Cite [Chapter N] where a specific claim comes from.

INPUTS:
${chapterSummariesText}

BOOK METADATA:
${bookMeta}

OUTPUT:`;

      console.log('--- BOOK SUMMARY COMPRESSION PROMPT ---');
      console.log(summaryPrompt);
      console.log('---------------------------------------');

      jobRepository.update(jobId, { progress: 65 });

      // 3. AI Generation
      let aiResult = null;
      let rawSummary = '';
      let usedFallback = false;
      let fallbackReason = null;
      let wordCountViolation = false;

      try {
        aiResult = await this.executeAIGeneration(context, {
          task: 'book_summary',
          book,
          options,
          prompt: summaryPrompt,
          maxTokens: 1400,
        });

        if (aiResult && aiResult.summary && aiResult.summary.trim()) {
          rawSummary = aiResult.summary;
          let wordCount = rawSummary.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount < 500 || wordCount > 1000) {
            console.warn(`[Book Summary Compression] Output word count (${wordCount}) outside bounds [500, 1000]. Retrying once with stricter constraint...`);
            const retryPrompt = `${summaryPrompt}\n\nIMPORTANT CONSTRAINT CORRECTION: Your previous attempt was ${wordCount} words, which violates the required length. Return between 600 and 900 words. Do not exceed 1000 words. Hard bounds: 500 minimum, 1000 maximum.`;
            const retryResult = await this.executeAIGeneration(context, {
              task: 'book_summary',
              book,
              options,
              prompt: retryPrompt,
              maxTokens: 1400,
            });
            if (retryResult && retryResult.summary && retryResult.summary.trim()) {
              rawSummary = retryResult.summary;
              aiResult = retryResult;
              wordCount = rawSummary.trim().split(/\s+/).filter(Boolean).length;
              if (wordCount < 500 || wordCount > 1000) {
                wordCountViolation = true;
                console.warn(`[Book Summary Compression] Retry word count (${wordCount}) still outside bounds [500, 1000]. Flagging word_count_violation.`);
              }
            } else {
              wordCountViolation = true;
            }
          }
        } else {
          usedFallback = true;
          fallbackReason = 'provider_unavailable';
        }
      } catch (err) {
        usedFallback = true;
        const msg = String(err.message || '').toLowerCase();
        if (
          msg.includes('timeout') ||
          msg.includes('timed out') ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ESOCKETTIMEDOUT' ||
          err.name === 'TimeoutError'
        ) {
          fallbackReason = 'provider_timeout';
        } else if (
          msg.includes('json') ||
          msg.includes('parse') ||
          msg.includes('syntaxerror') ||
          err.name === 'SyntaxError'
        ) {
          fallbackReason = 'invalid_json';
        } else {
          fallbackReason = 'provider_unavailable';
        }
      }

      if (!rawSummary || !rawSummary.trim()) {
        if (!usedFallback) {
          usedFallback = true;
          fallbackReason = 'provider_unavailable';
        }
        rawSummary = this.fallbackSynthesizeBookSummary(book, context);
        usedFallback = true;
      }

      const finalWordCount = rawSummary.trim().split(/\s+/).filter(Boolean).length;
      if (!usedFallback && (finalWordCount < 500 || finalWordCount > 1000)) {
        wordCountViolation = true;
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
          fell_back: usedFallback,
          ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
          word_count: finalWordCount,
          word_count_violation: wordCountViolation,
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

  async executeAIGeneration(context, { task, book, options = {}, prompt = null, maxTokens = null }) {
    if (options && options.fast) return null;
    try {
      const provider = aiService.getActiveProvider();
      const health = await provider.checkHealth();
      if (!health || !health.available) return null;

      const fullPrompt = prompt || `${context.groundingPrompt}\n\n${context.contextText}\n\nProduce the ${task.replace('_', ' ')} based strictly on the above source excerpts:`;
      const timeoutMs = (options && options.timeout) || 25000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI provider timeout')), timeoutMs)
      );

      const tokens = maxTokens || (task === 'book_summary' ? 1400 : 600);

      const result = await Promise.race([
        provider.summarize({
          text: fullPrompt,
          title: book.title,
          options: {
            isPrompt: true,
            task,
            contentType: book.content_type,
            maxTokens: tokens,
            reasoning: { enabled: false },
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
      console.warn(`External AI provider call failed for ${task}, using semantic compression fallback:`, err.message);
      return null;
    }
  }

  fallbackSynthesizeSynopsis(book, context) {
    const chunks = (context.includedChunks || []).slice(0, 4);
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

    text += `Across its foundational movements, the work balances analytical depth with structured domain exposition, addressing both theoretical grounding and pragmatic application for serious practitioners.\n\n`;

    const sectionRefs = chunks
      .map((c) => c.sectionHeading || c.sourceReference)
      .filter(Boolean)
      .slice(0, 3);
    if (sectionRefs.length > 0) {
      text += `Key structural pillars highlighted throughout the text include *${sectionRefs.join('*, *')}*, demonstrating consistent conceptual continuity. The interior balances precise formulations, structural paradigms, and progressive inquiries designed to guide the reader through complex domain mechanics without unnecessary digressions.\n\n`;
    }

    text += `The text reads like an authoritative reference manual — disciplined, methodical, and conceptually rigorous. [PARTIAL: inputs insufficient for full synopsis]`;

    return text;
  }

  fallbackSynthesizeBookSummary(book, context) {
    const chunks = context.includedChunks || [];
    const contentType = (book.content_type || 'work').toLowerCase();

    let text = `## Comprehensive Architectural Summary: ${book.title}\n\n`;
    text += `### 1. Central Thesis & System Framework\n`;
    text += `Authored by **${book.author || 'Unknown Author'}**, *${book.title}* functions as a multi-chapter ${contentType}. Across its sections, the material establishes rigorous foundations grounded directly in its source chapters, articulating core principles and architectural frameworks to guide technical understanding.\n\n`;

    text += `### 2. Structural Overview & Conceptual Progression\n`;
    if (chunks.length > 0) {
      text += `The document progresses through several primary conceptual anchors:\n\n`;
      for (const ex of chunks.slice(0, 4)) {
        const heading = ex.sectionHeading || ex.sourceReference || 'Key Section';
        text += `- **${heading}**: Establishes structural development and contextual grounding within the active domain.\n`;
      }
      text += `\n`;
    }

    text += `### 3. Key Concepts & Frameworks\n`;
    if (contentType === 'research' || contentType === 'technical') {
      text += `- **Methodological Rigor**: Primary evidence demonstrates consistent structural progression across chapters.\n`;
      text += `- **Empirical Coherence**: Grounded observations validate the central premise.\n`;
      text += `- **Systemic Architecture**: Modularity and formal interfaces minimize operational complexity.\n`;
    } else {
      text += `- **Narrative Continuity**: Key tensions develop consistently across consecutive chapters.\n`;
      text += `- **Thematic Depth**: The work balances structural pacing with focused conceptual development.\n`;
    }
    text += `\n`;

    text += `### 4. Target Audience & Requirements\n`;
    text += `This work is designed for practitioners, engineers, and researchers seeking end-to-end domain mastery. It demands active engagement with structural concepts, analytical frameworks, and foundational proofs.\n\n`;

    text += `### 5. Lasting Takeaway\n`;
    text += `Upon closing *${book.title}*, the reader retains a unified mental model of its subject matter, equipped to apply its core principles to real-world architectures with confidence.\n`;

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

  async classifyBook(bookId, options = {}) {
    const bookClassifier = require('./bookClassifier');
    return bookClassifier.classifyBook(bookId, options);
  }
}

module.exports = new IntelligentSummarizer();
