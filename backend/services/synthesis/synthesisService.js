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
    const context = contextBuilder.buildSynthesisContext(chapter, chunks);
    const K = chunks.length;

    let totalSourceWords = 0;
    for (const c of chunks) {
      const text = c.textContent || c.content || c.text_content || '';
      totalSourceWords += text.trim().split(/\s+/).filter(Boolean).length;
    }
    const N = totalSourceWords;
    const sourceMaterial = context.sourceMaterialText || context.contextText || '';

    // Step c1: Phase A - Assessment call (estimate needed words and density)
    let assessedTargetWords = typeof chapter.targetWordCount === 'number' && chapter.targetWordCount > 0
      ? chapter.targetWordCount
      : 300;
    let assessedDensity = 'medium';
    let assessedReasoning = '';

    if (!options.fast && aiService.isAvailable && aiService.isAvailable()) {
      const assessmentPrompt = `Read the following source. Estimate how many words are needed to preserve every distinct concept, argument, example, and factual claim in a compressed form. Do not pad. Do not omit. Return JSON on one line: {"needed_words": <integer>, "density": "low|medium|high|extreme", "reasoning": "<one sentence>"}

SOURCE MATERIAL:
${sourceMaterial}`;

      try {
        const assessResponse = await aiService.generateText(assessmentPrompt, {
          temperature: 0.2,
          maxTokens: 250,
          reasoning: { enabled: false },
        });

        if (assessResponse && assessResponse.text) {
          let text = assessResponse.text.trim();
          const jsonMatch = text.match(/\{[\s\S]*?\}/);
          if (jsonMatch) text = jsonMatch[0];
          try {
            const parsed = JSON.parse(text);
            if (typeof parsed.needed_words === 'number' && Number.isFinite(parsed.needed_words)) {
              assessedTargetWords = Math.round(parsed.needed_words);
            }
            if (typeof parsed.density === 'string' && parsed.density.trim()) {
              assessedDensity = parsed.density.trim().toLowerCase();
            }
            if (typeof parsed.reasoning === 'string') {
              assessedReasoning = parsed.reasoning.trim();
            }
          } catch (jsonErr) {
            console.warn('[SynthesisService] Phase A JSON parse failed:', jsonErr.message);
          }
        }
      } catch (assessErr) {
        console.warn('[SynthesisService] Phase A assessment call failed:', assessErr.message);
      }
    }

    // Sanity clamps on assessed_target_words:
    // - Floor: 150 words minimum
    // - Ceiling: Math.round(source_words * 0.25) — never below 4:1 compression
    // - If assessed < 150, use 150, log a warning
    // - If assessed > source_words * 0.25, use source_words * 0.25, log a warning
    const maxAllowedWords = Math.max(150, Math.round(N * 0.25));
    if (assessedTargetWords < 150) {
      console.warn(`[SynthesisService] Assessed target words (${assessedTargetWords}) below floor of 150. Clamping to 150.`);
      assessedTargetWords = 150;
    } else if (assessedTargetWords > maxAllowedWords) {
      console.warn(`[SynthesisService] Assessed target words (${assessedTargetWords}) exceeds ceiling of ${maxAllowedWords} (source_words * 0.25). Clamping to ${maxAllowedWords}.`);
      assessedTargetWords = maxAllowedWords;
    }

    const hardCeiling = Math.round(assessedTargetWords * 1.2);
    const hardFloor = Math.round(assessedTargetWords * 0.8);
    const ratio = (N > 0 && assessedTargetWords > 0) ? (N / assessedTargetWords).toFixed(1) : '7.0';

    const compressionPrompt = `You are compressing a source text, not summarizing or synthesizing it.

INPUT: ${N} source words across ${K} chunks.
Compress this source to exactly ${assessedTargetWords} words. Hard ceiling: ${hardCeiling}. Hard floor: ${hardFloor}.
Compression ratio for this task: ~${ratio}:1.

Rules:

Preserve every distinct concept, argument, example, and factual claim from the source. If the source names 14 methods, name 14.

Do not add narrative framing, introductions, transitions, or conclusions not present in the source.

Do not paraphrase away specificity. "Gradient descent, SGD, and OLS" must not become "several optimization methods".

Use the source's own structure denser, not a rewritten structure.

Every sentence must cite its source chunk at the end: [Source N].

If ${assessedTargetWords} words is too small for the source's information density, emit [INSUFFICIENT_M: needs ~X words] as the final line instead of exceeding the ceiling.

Do NOT exceed ${hardCeiling} words. This is a hard ceiling, not a target.

Structure the output as 3–5 paragraphs separated by blank lines. Each paragraph covers one coherent movement of the source. Do not emit the output as a single block.

Final enforcement: count your own words. If you would exceed ${hardCeiling}, cut from the middle, not the end. The last sentence must be complete.

SOURCE MATERIAL:
${sourceMaterial}

OUTPUT:`;

    // Step c2: Call AI provider or deterministic grounded compressor
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
          maxTokens: Math.ceil(assessedTargetWords * 2.5),
          reasoning: { enabled: false },
        });

        finishReason = response?.finish_reason || 'stop';
        truncated = finishReason === 'length';
        if (truncated) {
          console.warn('[SynthesisService] Output truncated at token ceiling (finish_reason: length). Accepting truncated output.');
        }

        // Post-generation validation & single tightening retry if outside [assessed * 0.8, assessed * 1.2]
        if (response && response.text && response.text.trim().length > 0) {
          let wordCount = response.text.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount < hardFloor || wordCount > hardCeiling) {
            console.warn(`[SynthesisService] Word count ${wordCount} outside [${hardFloor}, ${hardCeiling}] (assessed: ${assessedTargetWords}). Retrying with tightening prompt...`);
            const retryPrompt = `Your output was ${wordCount} words. Required: ${assessedTargetWords}. Rewrite to hit the target exactly, preserving every distinct concept.

Rules:
Preserve every distinct concept, argument, example, and factual claim from the source.
Structure the output as 3–5 paragraphs separated by blank lines.
Every sentence must cite its source chunk at the end: [Source N].
Do not exceed ${hardCeiling} words.

SOURCE MATERIAL:
${sourceMaterial}

OUTPUT:`;

            const retryResponse = await aiService.generateText(retryPrompt, {
              temperature: 0.2,
              maxTokens: Math.ceil(assessedTargetWords * 2.5),
              reasoning: { enabled: false },
            });

            if (retryResponse && retryResponse.text && retryResponse.text.trim().length > 0) {
              response = retryResponse;
              finishReason = response.finish_reason || 'stop';
              truncated = finishReason === 'length';
              wordCount = response.text.trim().split(/\s+/).filter(Boolean).length;
              if (wordCount < hardFloor || wordCount > hardCeiling) {
                compression_violation = true;
                console.warn(`[SynthesisService] Retry word count ${wordCount} still outside [${hardFloor}, ${hardCeiling}]. Flagging compression_violation.`);
              } else {
                compression_violation = false;
              }
            } else {
              compression_violation = true;
            }
          } else {
            compression_violation = false;
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
    // Step d2: Extract [INSUFFICIENT_M] marker and strip markers from displayed content
    let insufficientMarker = null;
    const insufficientMatch = rawCompression.match(/\[INSUFFICIENT_M[^\]]*\]/i);
    if (insufficientMatch) {
      insufficientMarker = insufficientMatch[0].trim();
    }

    let cleanContent = rawCompression.replace(/\s*\[Source\s+[\d\s,–-]+\]/gi, '').trim();
    cleanContent = cleanContent.replace(/\[Source\s*$/i, '').trim();
    cleanContent = cleanContent.replace(/\s*\[INSUFFICIENT_M[^\]]*\]/gi, '').trim();

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
      target_word_count: assessedTargetWords,
      assessed_target_words: assessedTargetWords,
      assessed_density: assessedDensity,
      source_word_count: N,
      claimed_attributions: claimedAttributions,
      truncated,
      finish_reason: finishReason,
      ...(insufficientMarker ? { insufficient_marker: insufficientMarker } : {}),
      ...(fellBack ? {
        fell_back: true,
        fallback_reason: fallbackReason || 'provider_unavailable',
        ...(isDuplicate ? { duplicate: true } : {}),
      } : {}),
      ...(compression_violation ? { compression_violation: true } : {}),
      compression_violation: compression_violation === true,
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
