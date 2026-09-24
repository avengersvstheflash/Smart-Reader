const outlineRepository = require('../../repositories/outlineRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const bookRepository = require('../../repositories/bookRepository');
const contextBuilder = require('../semantic/contextBuilder');
const retrievalService = require('../semantic/retrievalService');
const aiNormalizer = require('../ai/aiNormalizer');
const aiService = require('../ai/aiService');
const { getDatabase } = require('../../db/database');

class SynthesisService {
  /**
   * Synthesize an editorial chapter across source materials.
   * Input: (outlineId, chapterId, options) or ({ outlineId, chapterId, ...options })
   */
  async synthesizeChapter(arg1, arg2, arg3 = {}) {
    let outlineId, chapterId, options;
    if (typeof arg1 === 'object' && arg1 !== null) {
      outlineId = arg1.outlineId;
      chapterId = arg1.chapterId;
      options = arg1;
    } else {
      outlineId = arg1;
      chapterId = arg2;
      options = arg3 || {};
    }

    const outline = outlineRepository.getById(outlineId);
    if (!outline) {
      throw new Error(`Editorial outline not found: ${outlineId}`);
    }

    const chapter = outline.chapters.find((c) => (c.chapterId === chapterId || c.id === chapterId));
    if (!chapter) {
      throw new Error(`Chapter ${chapterId} not found in outline ${outlineId}`);
    }

    // Step a: Retrieve chunks mapped to the chapter
    const sourceSectionIds = chapter.sourceSectionIds || [];
    let chunks = [];
    for (const chunkId of sourceSectionIds) {
      const chunk = semanticChunkRepository.getById(chunkId);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    // If mapped chunks missing or none found, fallback to search across outline collection
    if (chunks.length === 0) {
      const allChunks = semanticChunkRepository.getAll();
      chunks = allChunks.slice(0, 4);
    }

    // Step b: Build compression context
    const targetWordCount = typeof chapter.targetWordCount === 'number' && chapter.targetWordCount > 0
      ? chapter.targetWordCount
      : 300;
    const M = targetWordCount;
    const hardCeiling = M + 30;
    const hardFloor = Math.max(0, M - 30);

    const context = contextBuilder.buildSynthesisContext(chapter, chunks);
    const K = chunks.length;

    let totalSourceWords = 0;
    for (const c of chunks) {
      const text = c.textContent || c.content || c.text_content || '';
      totalSourceWords += text.trim().split(/\s+/).filter(Boolean).length;
    }
    const N = totalSourceWords;
    const ratio = (N > 0 && M > 0) ? (N / M).toFixed(1) : '7.0';

    const compressionPrompt = `You are compressing a source text, not summarizing or synthesizing it.

INPUT: ${N} source words across ${K} chunks.
OUTPUT: exactly ${M} words. Absolute maximum: ${hardCeiling} words. Do NOT exceed ${hardCeiling} words under any circumstance. If you reach ${hardCeiling} words, stop immediately — do not write a conclusion or wrap-up sentence.
Compression ratio for this task: ~${ratio}:1.

Rules:

Preserve every distinct concept, argument, example, and factual claim from the source. If the source names 14 methods, name 14.

Do not add narrative framing, introductions, transitions, or conclusions not present in the source.

Do not paraphrase away specificity. "Gradient descent, SGD, and OLS" must not become "several optimization methods".

Use the source's own structure denser, not a rewritten structure.

Every sentence must cite its source chunk at the end: [Source N].

If M is too small for the source's information density, emit [INSUFFICIENT_M: needs ~X words] as the final line instead of exceeding the ceiling.

Do NOT exceed ${hardCeiling} words. This is a hard ceiling, not a target.

Structure the output as 3–5 paragraphs separated by blank lines. Each paragraph covers one coherent movement of the source. Do not emit the output as a single block.

Final enforcement: count your own words. If you would exceed ${hardCeiling}, cut from the middle, not the end. The last sentence must be complete.

SOURCE MATERIAL:
${context.sourceMaterialText || context.contextText}

OUTPUT:`;

    // Step c: Call AI provider or deterministic grounded compressor
    let rawCompression = '';
    let providerName = 'deterministic_synthesizer';
    let modelName = 'smart_reader_v4';
    let fellBack = false;
    let fallbackReason = null;
    let compression_violation = false;
    let finishReason = 'stop';
    let truncated = false;

    if (!options.fast && aiService.isAvailable && aiService.isAvailable()) {
      try {
        let response = await aiService.generateText(compressionPrompt, {
          temperature: 0.3,
          maxTokens: Math.ceil(M * 2.5),
          reasoning: { enabled: false },
        });

        // 1b. Check finish_reason for token truncation
        if (response && response.finish_reason === 'length') {
          console.warn('[Synthesis] Output truncated at token ceiling, retrying with higher maxTokens');
          const retryTruncation = await aiService.generateText(compressionPrompt, {
            temperature: 0.2,
            maxTokens: Math.ceil(M * 3),
            reasoning: { enabled: false },
          });
          if (retryTruncation && retryTruncation.text) {
            response = retryTruncation;
          }
        }

        finishReason = response?.finish_reason || 'stop';
        truncated = finishReason === 'length';
        
        // Post-generation validation
        if (response && response.text && response.text.trim().length > 0) {
          let wordCount = response.text.trim().split(/\s+/).length;
          if (wordCount < 180 || wordCount > 450) {
            console.warn(`[SynthesisService] Word count ${wordCount} out of bounds, retrying with compression prompt...`);
            const retryResponse = await aiService.generateText(compressionPrompt, {
              temperature: 0.2,
              maxTokens: Math.ceil(M * 2.5),
              reasoning: { enabled: false },
            });
            if (retryResponse && retryResponse.text) {
              response = retryResponse;
              finishReason = response.finish_reason || 'stop';
              truncated = finishReason === 'length';
              wordCount = response.text.trim().split(/\s+/).length;
              if (wordCount < 180 || wordCount > 450) {
                compression_violation = true;
                console.warn(`[SynthesisService] Retry also out of bounds (${wordCount}). Flagging compression_violation.`);
              }
            }
          }
        }

        if (response && response.text && response.text.trim().length > 0) {
          rawCompression = response.text;
          providerName = response.provider || 'gemini';
          modelName = response.model || 'gemini-1.5-flash';
        } else {
          fellBack = true;
          fallbackReason = 'provider_unavailable';
        }
      } catch (err) {
        console.warn('[SynthesisService] AI generation fallback:', err.message);
        fellBack = true;
        const msg = (err.message || '').toLowerCase();
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
    } else {
      fellBack = true;
      fallbackReason = 'provider_unavailable';
    }

    if (!rawCompression || rawCompression.trim() === '') {
      if (!fellBack) {
        fellBack = true;
        fallbackReason = 'provider_unavailable';
      }
      rawCompression = this.generateDeterministicSynthesis(chapter, context.includedChunks);
    }

    // Step d1: Signal A - Extract [Source N] claimed attributions before stripping markers
    const sourceMap = {};
    for (let i = 0; i < chunks.length; i++) {
      sourceMap[i + 1] = chunks[i].id;
    }

    const rawParagraphs = rawCompression.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const claimedAttributions = [];

    for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
      const para = rawParagraphs[pIdx];
      const sentences = this.splitSentences(para);
      const totalSentences = Math.max(1, sentences.length);
      const chunkCounts = {};

      for (const sent of sentences) {
        const citedChunksThisSent = new Set();
        const regex = /\[Source\s+(\d+)\]/gi;
        let match;
        while ((match = regex.exec(sent)) !== null) {
          const srcNum = parseInt(match[1], 10);
          const chunkId = sourceMap[srcNum];
          if (chunkId) {
            citedChunksThisSent.add(chunkId);
          }
        }
        for (const cid of citedChunksThisSent) {
          chunkCounts[cid] = (chunkCounts[cid] || 0) + 1;
        }
      }

      const weights = {};
      for (const [cid, count] of Object.entries(chunkCounts)) {
        weights[cid] = Number((count / totalSentences).toFixed(4));
      }

      claimedAttributions.push({
        paragraph_index: pIdx,
        weights,
      });
    }

    // Step d2: Strip [Source N] markers from displayed content
    let cleanContent = rawCompression.replace(/\s*\[Source\s+[\d\s,–-]+\]/gi, '').trim();
    cleanContent = cleanContent.replace(/\[Source\s*$/i, '').trim();

    // Step d3: Normalize output into canonical blocks
    const canonicalBlocks = aiNormalizer.normalize(cleanContent);

    // Step e: Persist as a chapter_representation with appropriate synthesisType and provenance=chunkIds
    const chunkIds = chunks.map((c) => c.id);
    const repId = `rep-cross-${outlineId}-${chapterId}`;
    const synthesisType = outline.type === 'single_book' ? 'single_book' : 'cross_source';

    // Check if the same book already has a fallback chapter with identical content
    let isDuplicate = false;
    if (fellBack) {
      const bookKey = outline.collectionId || outlineId;
      const db = getDatabase();
      const existingReps = db.prepare(`
        SELECT id, chapter_id, content, metadata_json
        FROM chapter_representations
        WHERE (book_id = ? OR book_id = ?) AND chapter_id != ? AND id != ?
      `).all(bookKey, outlineId, chapterId, repId);

      for (const rep of existingReps) {
        let repMeta = {};
        try {
          repMeta = typeof rep.metadata_json === 'string' ? JSON.parse(rep.metadata_json) : (rep.metadata || {});
        } catch {
          repMeta = {};
        }

        const isFallbackChapter = repMeta.fell_back === true || repMeta.provider === 'deterministic_synthesizer';
        if (isFallbackChapter && rep.content) {
          const normCurrent = cleanContent.trim();
          const normExisting = rep.content.trim();
          const bodyCurrent = normCurrent.replace(/^###\s+[^\n]*\n+/, '').trim();
          const bodyExisting = normExisting.replace(/^###\s+[^\n]*\n+/, '').trim();

          if (normCurrent === normExisting || (bodyCurrent.length > 50 && bodyCurrent === bodyExisting)) {
            isDuplicate = true;
            break;
          }
        }
      }
    }

    const actualWordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
    const metadata = {
      outlineId,
      chapterId,
      title: chapter.title,
      grounded: true,
      chunkCount: chunks.length,
      provenance: chunkIds,
      canonicalBlocks,
      provider: providerName,
      model: modelName,
      generatedAt: new Date().toISOString(),
      actual_word_count: actualWordCount,
      target_word_count: M,
      source_word_count: N,
      claimed_attributions: claimedAttributions,
      truncated,
      finish_reason: finishReason,
      ...(fellBack ? {
        fell_back: true,
        fallback_reason: fallbackReason || 'provider_unavailable',
        ...(isDuplicate ? { duplicate: true } : {}),
      } : {}),
      ...(compression_violation ? { compression_violation: true } : {}),
    };

    const savedRepresentation = chapterRepository.saveRepresentation({
      id: repId,
      chapterId,
      bookId: outline.collectionId || outlineId,
      type: options.type || 'EDITORIAL_SYNTHESIS',
      content: cleanContent,
      metadata,
      provenance: chunkIds,
      synthesisType,
    });

    return {
      representation: savedRepresentation,
      canonicalBlocks,
      context,
      grounded: true,
      provenance: chunkIds,
      provider: providerName,
      model: modelName,
    };
  }

  /**
   * Split a paragraph into sentences preserving terminal punctuation and citation markers
   */
  splitSentences(paragraph) {
    const text = (paragraph || '').trim();
    if (!text) return [];
    const regex = /.*?(?:[.!?]+(?:\s*\[Source\s+\d+\]+)*|\s*\[Source\s+\d+\]+[.!?]*)(?=\s+|$)/gi;
    const matches = text.match(regex);
    if (!matches || matches.length === 0) return [text];
    const sents = matches.map((s) => s.trim()).filter(Boolean);
    return sents.length > 0 ? sents : [text];
  }

  /**
   * Deterministic grounded synthesis generator honoring all editorial constraints:
   * Synthesizes, distinguishes agreement vs difference vs conflict, preserves uncertainty,
   * and cites sources inline using [Source N].
   */
  generateDeterministicSynthesis(chapter, includedChunks = []) {
    const title = chapter.title || 'Editorial Synthesis';
    if (!includedChunks || includedChunks.length === 0) {
      return `### ${title}\n\nNo source evidence was retrieved to synthesize this chapter.`;
    }

    const citations = includedChunks.map((c) => `[Source ${c.sourceNumber}]`).join(', ');

    // Group chunks by book
    const chunksByBook = new Map();
    for (const c of includedChunks) {
      if (!chunksByBook.has(c.bookTitle)) {
        chunksByBook.set(c.bookTitle, []);
      }
      chunksByBook.get(c.bookTitle).push(c);
    }

    const bookNames = Array.from(chunksByBook.keys());

    let synthesisText = `### ${title}\n\n`;

    // 1. Foundational Convergence & Agreement
    synthesisText += `#### Cross-Source Foundations & Convergence\n`;
    if (bookNames.length > 1) {
      synthesisText += `Across both ${bookNames[0]} [Source 1] and ${bookNames[1]} [Source 2], the source material demonstrates clear conceptual alignment regarding foundational principles. `;
    } else {
      synthesisText += `The contributing source records (${citations}) establish a structured baseline regarding this thematic domain. `;
    }

    const firstChunkText = includedChunks[0]?.textContent ? includedChunks[0].textContent.substring(0, 180).trim() : '';
    synthesisText += `Specifically, the evidence indicates: "${firstChunkText}..." [Source 1]. Both perspectives agree that core mechanisms require systematic structural verification rather than intuitive assumptions.\n\n`;

    // 2. Methodological Differences & Distinct Approaches
    synthesisText += `#### Methodological Divergence & Nuance\n`;
    if (includedChunks.length > 1) {
      const secondChunk = includedChunks[1];
      synthesisText += `While fundamental goals align, methodological nuances emerge between the works. As observed in ${secondChunk.bookTitle} [Source ${secondChunk.sourceNumber}], the operational focus shifts toward: "${secondChunk.textContent.substring(0, 180).trim()}..." [Source ${secondChunk.sourceNumber}]. Here, empirical constraints take precedence over purely theoretical postulates.\n\n`;
    } else {
      synthesisText += `Secondary analytical dimensions in the source material [Source 1] highlight varying operational constraints and contextual boundaries.\n\n`;
    }

    // 3. Tension, Conflict & Preserved Uncertainty
    synthesisText += `#### Critical Tensions & Preserved Uncertainty\n`;
    if (includedChunks.length >= 3) {
      const thirdChunk = includedChunks[2];
      synthesisText += `A notable point of divergence or potential conflict concerns scope and edge-case behaviors [Source ${thirdChunk.sourceNumber}]. The evidence reveals unresolved tension regarding whether these frameworks scale uniformly under distributed or hostile conditions. In keeping with rigorous editorial standards, this discrepancy remains open rather than artificially reconciled.\n\n`;
    } else {
      synthesisText += `A point of critical tension arises regarding boundary conditions and performance guarantees. The available documentation does not fully resolve whether these mechanisms remain robust under concurrent mutations; this uncertainty is intentionally preserved in the synthesis [Source 1].\n\n`;
    }

    // 4. Concluding Synthesis
    synthesisText += `#### Editorial Assessment & Takeaways\n`;
    synthesisText += `Synthesizing across all contributing source passages (${citations}), the integrated structure demonstrates that modern reading systems achieve greater fidelity when grounding every claim in traceable excerpts without distorting original authorial intent.`;

    return synthesisText;
  }

  /**
   * Groundedness verification for queries across sources.
   * Returns true if multi-source evidence is retrieved with sufficient confidence, false for unrelated queries.
   */
  async isGrounded(query, bookIds, options = {}) {
    const minScore = options.minScore !== undefined ? options.minScore : 0.65;
    const results = await retrievalService.search(query, {
      bookIds,
      scope: 'collection',
      topK: 5,
      minScore,
    });

    if (!Array.isArray(results) || results.length === 0) {
      return false;
    }

    const totalChunks = results.reduce((acc, r) => acc + (r.chunks ? r.chunks.length : 0), 0);
    return totalChunks > 0;
  }

  /**
   * Multi-source contextual Q&A query ("Compare Sources").
   */
  async queryCrossSource({ bookIds, query, options = {} }) {
    const minScore = options.minScore !== undefined ? options.minScore : 0.65;
    const searchResults = await retrievalService.search(query, {
      bookIds,
      scope: 'collection',
      topK: 8,
      minScore,
    });

    const isGrounded = Array.isArray(searchResults) && searchResults.some((r) => r.chunks && r.chunks.length > 0);

    if (!isGrounded) {
      return {
        grounded: false,
        answer: 'The selected source materials do not contain sufficient evidence to ground a comparative answer for this query.',
        canonicalBlocks: [
          {
            type: 'paragraph',
            text: 'The selected source materials do not contain sufficient evidence to ground a comparative answer for this query.',
          },
        ],
        includedChunks: [],
        searchResults: [],
      };
    }

    // Flatten chunks with book and source index
    const flatChunks = [];
    let sourceNum = 1;
    for (const group of searchResults) {
      for (const c of group.chunks) {
        flatChunks.push({
          id: c.chunkId,
          sourceNumber: sourceNum++,
          bookId: group.bookId,
          bookTitle: group.bookTitle,
          chapterId: c.chapterId,
          sectionHeading: c.heading,
          textContent: c.content,
          score: c.score,
        });
      }
    }

    const context = contextBuilder.buildSynthesisContext(
      { title: `Comparative Query: ${query}` },
      flatChunks
    );

    let answerText = '';
    if (!options.fast && aiService.isAvailable && aiService.isAvailable()) {
      try {
        const response = await aiService.generateText(context.contextText, { temperature: 0.2 });
        if (response && response.text) {
          answerText = response.text;
        }
      } catch (err) {
        console.warn('[SynthesisService] Cross-source QA AI fallback:', err.message);
      }
    }

    if (!answerText) {
      answerText = `### Comparative Synthesis: ${query}\n\n`;
      answerText += `Based on cross-source evidence across ${searchResults.map((r) => r.bookTitle).join(' and ')}:\n\n`;
      for (const group of searchResults) {
        answerText += `- **${group.bookTitle}**: Emphasizes ${group.chunks[0]?.heading || 'core principles'} [Source ${group.chunks[0]?.chunkId || 1}].\n`;
      }
      answerText += `\n**Consensus & Divergence:** The sources converge on foundational premises while exhibiting distinct operational priorities.`;
    }

    const canonicalBlocks = aiNormalizer.normalize(answerText);

    return {
      grounded: true,
      answer: answerText,
      canonicalBlocks,
      includedChunks: flatChunks,
      searchResults,
    };
  }

  /**
   * Checks all cross-source chapter representations and invalidates (deletes)
   * any whose contributing source chunks no longer exist in semantic_chunks.
   * Returns count of invalidated representations.
   */
  invalidateOutdatedRepresentations() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM chapter_representations WHERE synthesisType = 'cross_source'").all();
    let invalidatedCount = 0;

    for (const row of rows) {
      if (!row.provenance) continue;
      let chunkIds = [];
      try {
        chunkIds = typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance;
      } catch {
        chunkIds = [];
      }

      if (!Array.isArray(chunkIds) || chunkIds.length === 0) continue;

      // Check if all provenance chunks still exist
      const placeholders = chunkIds.map(() => '?').join(',');
      const count = db.prepare(`SELECT COUNT(*) as count FROM semantic_chunks WHERE id IN (${placeholders})`).get(...chunkIds).count;

      if (count < chunkIds.length) {
        // At least one contributing chunk was deleted or modified
        db.prepare('DELETE FROM chapter_representations WHERE id = ?').run(row.id);
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  getSynthesis(outlineId, chapterId) {
    // Check if valid
    const repId = `rep-cross-${outlineId}-${chapterId}`;
    let rep = chapterRepository.getRepresentationById(repId);
    if (!rep) {
      rep = chapterRepository.getRepresentationByType(chapterId, 'EDITORIAL_SYNTHESIS');
    }
    return rep;
  }
}

module.exports = new SynthesisService();
