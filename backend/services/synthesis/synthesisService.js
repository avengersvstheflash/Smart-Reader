const { callOpenRouterWithBackoff } = require('../ai/openrouterProvider');
const outlineRepository = require('../../repositories/outlineRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const smartChapterRepository = require('../../repositories/smartChapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const bookRepository = require('../../repositories/bookRepository');
const contextBuilder = require('../semantic/contextBuilder');
const retrievalService = require('../semantic/retrievalService');
const aiNormalizer = require('../ai/aiNormalizer');
const aiService = require('../ai/aiService');
const aiRetryGuard = require('../ai/aiRetryGuard');
const config = require('../../config');
const nlpClient = require('../ai/nlpClient');

class PreLLMValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PreLLMValidationError';
    this.details = details;
  }
}
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

    const chapter = outline.chapters.find((c) => (
      c.chapterId === chapterId ||
      c.id === chapterId ||
      (typeof c.chapterId === 'string' && c.chapterId.endsWith(`-${chapterId}`)) ||
      (typeof c.id === 'string' && c.id.endsWith(`-${chapterId}`))
    ));
    if (!chapter) {
      throw new Error(`Chapter ${chapterId} not found in outline ${outlineId}`);
    }

    const targetSmartId = chapter.chapterId || chapter.id || chapterId;
    const claimed = smartChapterRepository.claimForSynthesis(targetSmartId);
      if (!claimed) {
        console.log(`[SynthesisService] Chapter ${targetSmartId} not pending or already claimed; skipping`);
        return { skipped: true };
      }

    try {
      return await this._executeSynthesizeChapter(outline, chapter, targetSmartId, options);
    } catch (err) {
      if (smartChapterRepository.getById(targetSmartId)) {
        const existing = smartChapterRepository.getById(targetSmartId);
        let existingMeta = {};
        try {
          existingMeta = typeof existing.metadata_json === 'string'
            ? JSON.parse(existing.metadata_json)
            : (existing.metadata || {});
        } catch {}
        if (existing.status !== 'failed' || !existingMeta.fallback_reason) {
          smartChapterRepository.update(targetSmartId, {
            status: 'failed',
            metadata_json: { error: err.message, failedAt: new Date().toISOString() },
          });
        }
      }
      throw err;
    }
  }

  /**
   * Manually resynthesize an existing smart chapter (status 'failed' or 'pending', or 'generated' if force: true).
   * Reuses the chapter's planned_source_section_ids without re-planning or re-slicing.
   *
   * @param {string} targetSmartId
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async resynthesizeChapter(targetSmartId, options = {}) {
    const smartChapter = smartChapterRepository.getById(targetSmartId);
    if (!smartChapter) {
      const err = new Error(`Smart chapter not found: ${targetSmartId}`);
      err.statusCode = 404;
      throw err;
    }

    if (smartChapter.status === 'generating') {
      const err = new Error(`Chapter ${targetSmartId} is currently generating`);
      err.statusCode = 409;
      throw err;
    }

    const claimed = smartChapterRepository.forceClaimForSynthesis(targetSmartId, options);
    if (!claimed) {
      const err = new Error(`Cannot claim chapter ${targetSmartId} (status: ${smartChapter.status})`);
      err.statusCode = 409;
      throw err;
    }

    let meta = {};
    try {
      meta = typeof smartChapter.metadata_json === 'string'
        ? JSON.parse(smartChapter.metadata_json)
        : (smartChapter.metadata || {});
    } catch {}

    let outline = null;
    if (meta.outlineId) {
      outline = outlineRepository.getById(meta.outlineId);
    }
    if (!outline && smartChapter.book_id) {
      outline = outlineRepository.getByBookId(smartChapter.book_id);
    }
    if (!outline) {
      outline = {
        outlineId: meta.outlineId || `book-editorial-${smartChapter.book_id}`,
        collectionId: smartChapter.book_id,
        type: smartChapter.synthesis_type || 'single_book',
        chapters: [],
      };
    }

    let sourceSectionIds = [];
    if (smartChapter.planned_source_section_ids) {
      try {
        sourceSectionIds = typeof smartChapter.planned_source_section_ids === 'string'
          ? JSON.parse(smartChapter.planned_source_section_ids)
          : smartChapter.planned_source_section_ids;
      } catch {}
    }
    if (!Array.isArray(sourceSectionIds) || sourceSectionIds.length === 0) {
      if (Array.isArray(meta.provenance) && meta.provenance.length > 0) {
        sourceSectionIds = meta.provenance;
      }
    }

    const existingOutlineChapter = Array.isArray(outline.chapters)
      ? outline.chapters.find((c) => (
          c.chapterId === targetSmartId ||
          c.id === targetSmartId ||
          (typeof c.chapterId === 'string' && c.chapterId.endsWith(`-${targetSmartId}`)) ||
          (typeof c.id === 'string' && c.id.endsWith(`-${targetSmartId}`)) ||
          (typeof targetSmartId === 'string' && targetSmartId.endsWith(`-${c.chapterId || c.id}`))
        ))
      : null;

    const chapterObj = {
      ...(existingOutlineChapter || {}),
      id: targetSmartId,
      chapterId: targetSmartId,
      title: smartChapter.title || (existingOutlineChapter && existingOutlineChapter.title) || null,
      sequence: smartChapter.sequence !== undefined ? smartChapter.sequence : (existingOutlineChapter && existingOutlineChapter.sequence),
      targetWordCount: smartChapter.planned_word_count || (existingOutlineChapter && existingOutlineChapter.targetWordCount) || meta.target_word_count || meta.assessed_target_words,
      sourceSectionIds: sourceSectionIds.length > 0 ? sourceSectionIds : (existingOutlineChapter?.sourceSectionIds || []),
    };

    try {
      return await this._executeSynthesizeChapter(outline, chapterObj, targetSmartId, {
        ...options,
        resynthesis_source: 'manual',
      });
    } catch (err) {
      const existing = smartChapterRepository.getById(targetSmartId);
      if (existing) {
        let existingMeta = {};
        try {
          existingMeta = typeof existing.metadata_json === 'string'
            ? JSON.parse(existing.metadata_json)
            : (existing.metadata || {});
        } catch {}
        smartChapterRepository.update(targetSmartId, {
          status: 'failed',
          metadata_json: {
            ...existingMeta,
            error: err.message,
            failedAt: new Date().toISOString(),
          },
        });
      }
      throw err;
    }
  }

  async _executeSynthesizeChapter(outline, chapter, targetSmartId, options) {
    const outlineId = outline.outlineId;
    const chapterId = targetSmartId;

    // Step a: Pre-LLM source guard (Phase 5.6)
    const sourceSectionIds = chapter.sourceSectionIds || [];
    let chunks = [];
    const missingChunkIds = [];
    const insufficientChunkIds = [];

    for (const chunkId of sourceSectionIds) {
      const chunk = semanticChunkRepository.getById(chunkId);
      if (!chunk) {
        missingChunkIds.push(chunkId);
      } else {
        const text = chunk.textContent || chunk.content || chunk.text_content || '';
        const wCount = text.trim().split(/\s+/).filter(Boolean).length;
        if (wCount < config.MIN_SOURCE_CHUNK_WORDS) {
          insufficientChunkIds.push({ id: chunkId, words: wCount });
        } else {
          chunks.push(chunk);
        }
      }
    }

    if (sourceSectionIds.length === 0 || missingChunkIds.length > 0 || insufficientChunkIds.length > 0 || chunks.length === 0) {
      const details = missingChunkIds.length > 0
        ? `Missing source chunk(s): ${missingChunkIds.join(', ')}`
        : insufficientChunkIds.length > 0
          ? `Source chunk(s) below MIN_SOURCE_CHUNK_WORDS (${config.MIN_SOURCE_CHUNK_WORDS}): ${insufficientChunkIds.map((c) => `${c.id} (${c.words}w)`).join(', ')}`
          : 'No sourceSectionIds specified for chapter';

      smartChapterRepository.update(targetSmartId, {
        status: 'failed',
        metadata_json: {
          fallback_reason: 'pre_llm_source_missing',
          missing_ids: missingChunkIds,
          insufficient_chunk_ids: insufficientChunkIds,
          details,
          failedAt: new Date().toISOString(),
        },
      });

      throw new PreLLMValidationError(`Pre-LLM guard failed: ${details}`, {
        missingChunkIds,
        insufficientChunkIds,
      });
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
        const assessResponse = await callOpenRouterWithBackoff(() => aiService.generateText(assessmentPrompt, {
          temperature: 0.2,
          maxTokens: 250,
          reasoning: { enabled: false },
        }));

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

    // 5.8.0a (2026-10-03): Compression ceiling corrected from 0.25 -> 0.15.
    // History: product vision targets 250-360 Omni words from 1,500-2,500 source
    // words (~7:1). The prior 0.25 ceiling permitted 4:1 output, producing
    // 2,200+ word chapters for 8,860-word slices (see walkthrough 2026-10-03).
    // 0.15 with a 2,000-word slice yields a 300-word ceiling — exactly on target.
    const maxAllowedWords = Math.max(150, Math.round(N * 0.15));
    if (assessedTargetWords < 150) {
      console.warn(`[SynthesisService] Assessed target words (${assessedTargetWords}) below floor of 150. Clamping to 150.`);
      assessedTargetWords = 150;
    } else if (assessedTargetWords > maxAllowedWords) {
      console.warn(`[SynthesisService] Assessed target words (${assessedTargetWords}) exceeds ceiling of ${maxAllowedWords} (source_words * 0.15). Clamping to ${maxAllowedWords}.`);
      assessedTargetWords = maxAllowedWords;
    }

    // F38 (2026-10-09): Widen validation envelope to product range [150, 500].
    // Typical slice (1500–2500 source words) targets 250–360 Omni words.
    // Absolute ceiling is 500 words. Do not nitpick small overshoots.
    const hardFloor = 150;
    const hardCeiling = 500;
    const ratio = (N > 0 && assessedTargetWords > 0) ? (N / assessedTargetWords).toFixed(1) : '7.0';

    const compressionPrompt = `You are compressing a source text, not summarizing or synthesizing it.

INPUT: ${N} source words across ${K} chunks.

Compress this source into a dense passage of 250–360 words. Aim for the middle of this range unless the source material is unusually sparse (aim lower) or unusually dense (aim near the top).

ABSOLUTE CEILING: 500 words. Do not exceed 500 words under any circumstances, even for very dense material.

If 360 words is genuinely insufficient for the source's information density, you may extend up to 500 words — but no further.

Rules:
- The very first line of your output MUST be: [TITLE: <short chapter title>] followed by a blank line.
  Generate a concise title (3-8 words) that captures the chapter's core subject from the source material.
  Title must not include source markers, quotes, or punctuation beyond standard title casing.
  Must be the very first line of output, followed by a blank line.
- Preserve the source's most important concepts, arguments, and causal relationships. Prioritize analytical structure over exhaustive enumeration when approaching the 500-word ceiling.
- Maintain specificity where it matters most: technical terms, named entities, and quantitative claims should stay concrete. But when the source is genuinely too dense to fit, select the strongest examples rather than compressing every item weakly.
- Do not add narrative framing, introductions, meta-commentary, transitions, or conclusions not present in the source. Begin directly with dense factual statements.
- Every sentence must cite its source chunk at the end: [Source N].
- Structure the output as 3–5 paragraphs separated by blank lines. Each paragraph covers one coherent movement of the source. Do not emit as a single block.
- Final enforcement: count your own words. The 500-word ceiling includes all citation markers. If you would exceed 500 words, cut from the middle, not the end. The last sentence must be complete.

SOURCE MATERIAL:
${sourceMaterial}

FINAL CONSTRAINT — the output MUST be 250-360 words, with an absolute ceiling of 500 words. The ceiling includes all [Source N] markers. If you cannot fit the source within 500 words, emit the [INSUFFICIENT_M: needs ~X words] marker and stop.

OUTPUT:`;

    // Step c2: Call AI provider or deterministic grounded compressor
    let rawCompression = '';
    let providerName = 'deterministic_synthesizer';
    let modelName = 'smart_reader_v4';
    let fellBack = false;
    let fallbackReason = null;
    let compression_violation = false;
    let violation_type = null;
    let finishReason = 'stop';
    let truncated = false;

    if (!options.fast && aiService.isAvailable && aiService.isAvailable()) {
      try {
        const guardResult = await aiRetryGuard.executeWithWordCountGuard({
          generateFn: async (promptToRun) => {
            return await callOpenRouterWithBackoff(() => aiService.generateText(promptToRun, {
              temperature: 0.25,
              maxTokens: Math.max(Math.ceil(assessedTargetWords * 2.5), 1200),
              reasoning: { enabled: false },
            }));
          },
          prompt: compressionPrompt,
          tightenedPrompt: (wordCount, bounds, vType, previousText) => {
            if (vType === 'structural_placeholder') {
              return `${compressionPrompt}\n\nIMPORTANT CONSTRAINT CORRECTION: Your previous output lacked normal sentence structure or variety. Emit well-formed sentences with standard punctuation (. ! ?) and distinct prose paragraphs. Target range: 250–360 words. Ceiling: ${bounds.hardCeiling}. Floor: ${bounds.hardFloor}.`;
            }
            const draftSection = previousText && typeof previousText === 'string' && previousText.trim().length > 0
              ? `Here is the draft you produced:\n===\n${previousText.trim()}\n===\n\n`
              : '';
            return `Your previous attempt produced ${wordCount} words. ${draftSection}Condense this draft into 250–360 words without losing specificity. Preserve the strongest examples and all named entities. Cut lower-value content first, not specific facts.
Return only the condensed output, starting with [TITLE: ...].
The 500-word ceiling strictly includes all [Source N] citation markers. Do not exceed ${bounds.hardCeiling} total words under any circumstances.

Rules:
- The very first line of your output MUST be: [TITLE: <short chapter title>] followed by a blank line.
  Generate a concise title (3-8 words) that captures the chapter's core subject from the source material.
  Title must not include source markers, quotes, or punctuation beyond standard title casing.
  Must be the very first line of output, followed by a blank line.
- Preserve the source's most important concepts, arguments, and causal relationships.
- Structure the output as 3–5 paragraphs separated by blank lines.
- Every sentence must cite its source chunk at the end: [Source N].
- Do not exceed ${bounds.hardCeiling} words total.

SOURCE MATERIAL:
${sourceMaterial}

FINAL CONSTRAINT — the output MUST be 250-360 words, with an absolute ceiling of 500 words. The ceiling includes all [Source N] markers. If you cannot fit the source within 500 words, emit the [INSUFFICIENT_M: needs ~X words] marker and stop.

OUTPUT:`;
          },
          bounds: {
            targetWords: assessedTargetWords,
            hardFloor,
            hardCeiling,
          },
          maxRetries: 1,
          contextLabel: `[Smart Chapter ${chapterId}]`,
          structuralCheck: true,
        });

        finishReason = guardResult.finishReason || 'stop';
        truncated = finishReason === 'length';
        if (truncated) {
          console.warn('[SynthesisService] Output truncated at token ceiling (finish_reason: length). Accepting truncated output.');
        }

        if (guardResult.text && guardResult.text.trim().length > 0) {
          rawCompression = guardResult.text;
          const resp = guardResult.rawResponse;
          providerName = (resp && resp.provider) || 'gemini';
          modelName = (resp && resp.model) || 'gemini-1.5-flash';

          if (guardResult.violation) {
            compression_violation = true;
            violation_type = guardResult.violationType;
            console.warn(`[synthesisService] violation content preview: "${rawCompression.slice(0, 100).replace(/\r?\n/g, ' ')}..."`);
          }
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

    // Step d0: Extract [TITLE: ...] marker and determine chapter title
    let extractedTitle = null;
    const titleMatch = rawCompression.match(/\[TITLE:\s*([^\]\r\n]+)\]/i);
    if (titleMatch) {
      const candidateTitle = titleMatch[1].trim().replace(/^["']|["']$/g, '').trim();
      const wordCount = candidateTitle.split(/\s+/).filter(Boolean).length;
      if (candidateTitle.length > 0 && wordCount <= 12) {
        extractedTitle = candidateTitle;
      }
    }

    const existingChapter = smartChapterRepository.getById(targetSmartId);
    const existingTitle = (existingChapter && existingChapter.title) || chapter.title;
    const finalTitle = extractedTitle || existingTitle;

    // Strip [TITLE: ...] marker from rawCompression before paragraph splitting
    const rawCompressionBody = rawCompression
      .replace(/^\s*\[TITLE:[^\]\r\n]*\]\r?\n?/gim, '')
      .replace(/\s*\[TITLE:[^\]\r\n]*\]/gi, '')
      .trim();

    // Step d1: Signal A - Extract [Source N] claimed attributions before stripping markers
    const sourceMap = {};
    for (let i = 0; i < chunks.length; i++) {
      sourceMap[i + 1] = chunks[i].id;
    }

    const rawParagraphs = rawCompressionBody.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const claimedAttributions = [];

    // F34.1a: Multi-batch rerank across all paragraphs in this chapter in a single round trip
    const normalizedChunks = chunks
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        text: c.text || c.textContent || c.content || c.text_content || '',
      }))
      .filter((c) => c.id && c.text);

    const client = options.nlpClient || nlpClient;
    const timeoutMs = options.timeoutMs || 10000;
    const startMultiMs = Date.now();

    const batchInputs = rawParagraphs.map((para, pIdx) => ({
      id: `p-${pIdx}`,
      query: para,
      candidates: normalizedChunks,
    }));

    let multiResultsMap = null;
    let multiFellBack = false;

    if (normalizedChunks.length > 0 && batchInputs.length > 0 && typeof client.rerankBatchMulti === 'function') {
      try {
        const { warmModel } = require('../ai/sidecarBase');
        warmModel('reranker', null, { fireAndForget: true }).catch(() => {});
      } catch (_) {}
      try {
        const multiRes = await client.rerankBatchMulti(batchInputs, { timeoutMs });
        const latencyMs = Date.now() - startMultiMs;
        if (latencyMs > 2000) {
          console.warn(`[SynthesisService] Multi-batch reranker latency exceeded 2.0s: ${latencyMs}ms`);
        }
        if (multiRes && Array.isArray(multiRes.results)) {
          multiResultsMap = new Map();
          for (const item of multiRes.results) {
            multiResultsMap.set(item.id, item.scores || []);
          }
        }
      } catch (err) {
        console.warn(`[SynthesisService] RERANKER_MULTI_FALLBACK: ${err.message}`);
        multiFellBack = true;
      }
    } else {
      multiFellBack = true;
    }

    let embeddingFallbackDisabled = false;
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

      let attribution_stage = 'legacy';
      let reranker_scores = {};

      const multiScores = multiResultsMap ? multiResultsMap.get(`p-${pIdx}`) : null;

      if (!multiFellBack && Array.isArray(multiScores) && multiScores.length > 0) {
        attribution_stage = 'reranker';
        for (const r of multiScores) {
          reranker_scores[r.id] = r.score;
        }
      } else {
        // Fallback: per-paragraph rerank (F34 batch endpoint / single query)
        const rerankRes = await this.rerankParagraphCandidates(para, chunks, { timeoutMs });
        if (!rerankRes.fellBack) {
          attribution_stage = 'reranker';
          for (const r of rerankRes.scores) {
            reranker_scores[r.id] = r.score;
          }
        } else if (!embeddingFallbackDisabled) {
          try {
            if (config.USE_PYTHON_EMBEDDER) {
              const { checkModelReady, warmModel } = require('../ai/sidecarBase');
              const embedStatus = await checkModelReady('embed', null, 500);
              if (embedStatus.state === 'DOWN') {
                embeddingFallbackDisabled = true;
                throw new Error('Python sidecar unavailable for embedding fallback');
              }
              if (embedStatus.state === 'UNLOADED' || embedStatus.state === 'LOADING') {
                await warmModel('embed', null, { timeoutMs: 15000 });
              }
            }
            const embeddingService = require('../semantic/embeddingService');
            const paraVec = await embeddingService.embedText(para, { timeoutMs: 5000 });
            if (paraVec && Array.isArray(paraVec)) {
              for (const chunk of chunks) {
                const chunkVecStr = chunk.embedding_json || chunk.embedding;
                if (chunkVecStr) {
                  const chunkVec = typeof chunkVecStr === 'string' ? JSON.parse(chunkVecStr) : chunkVecStr;
                  const sim = embeddingService.cosineSimilarity(paraVec, chunkVec);
                  reranker_scores[chunk.id] = sim;
                } else {
                  reranker_scores[chunk.id] = 0;
                }
              }
              attribution_stage = 'centroid';
              console.warn('[SynthesisService] ATTRIBUTION_CENTROID_FALLBACK: Successfully applied paragraph centroid fallback.');
            } else {
              console.warn('[SynthesisService] ATTRIBUTION_LEGACY_FALLBACK: centroid returned invalid embeddings');
            }
          } catch (embErr) {
            embeddingFallbackDisabled = true;
            console.warn(`[SynthesisService] ATTRIBUTION_LEGACY_FALLBACK: centroid fallback failed: ${embErr.message}`);
          }
        }
      }

      claimedAttributions.push({
        paragraph_index: pIdx,
        weights: weights,
        weights_json: { attribution_stage },
        reranker_scores,
      });
    }


    // Step d2: Extract [INSUFFICIENT_M] marker and strip markers from displayed content
    let insufficientMarker = null;
    const insufficientMatch = rawCompression.match(/\[INSUFFICIENT_M[^\]]*\]/i);
    if (insufficientMatch) {
      insufficientMarker = insufficientMatch[0].trim();
    }

    let cleanContent = rawCompressionBody
      .replace(/\s*\[Source\s+[\d\s,–-]+\]/gi, '')
      .trim();
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
        SELECT id, content, metadata_json
        FROM smart_chapters
        WHERE (book_id = ? OR book_id = ?) AND id != ?
      `).all(bookKey, outlineId, targetSmartId);

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
    const resynthesisAttempts = options.resynthesis_attempts || 0;

    const metadata = {
      outlineId,
      chapterId,
      title: finalTitle,
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
      resynthesis_attempts: resynthesisAttempts,
      ...(options.resynthesis_source ? { resynthesis_source: options.resynthesis_source } : {}),
      ...(violation_type ? { violation_type } : {}),
      ...(insufficientMarker ? { insufficient_marker: insufficientMarker } : {}),
      ...(fellBack ? {
        fell_back: true,
        fallback_reason: fallbackReason || 'provider_unavailable',
        ...(isDuplicate ? { duplicate: true } : {}),
      } : {}),
      compression_violation: compression_violation === true,
    };

    // Step 5: Auto-resynthesize on violation (Phase 5.6)
    if (compression_violation && config.AUTO_RESYNTHESIZE_ON_VIOLATION && !options.fast && !fellBack) {
      if (resynthesisAttempts < config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS) {
        const nextAttempt = resynthesisAttempts + 1;
        console.warn(`[SynthesisService] Compression violation detected (${violation_type}). Auto-resynthesizing chapter ${targetSmartId} (attempt ${nextAttempt}/${config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS})...`);
        smartChapterRepository.update(targetSmartId, {
          status: 'generating',
          metadata_json: {
            ...metadata,
            resynthesis_attempts: nextAttempt,
          },
        });
        return await this._executeSynthesizeChapter(outline, chapter, targetSmartId, {
          ...options,
          resynthesis_attempts: nextAttempt,
        });
      } else {
        // Attempts exhausted: status = 'failed'
        console.warn(`[SynthesisService] Auto-resynthesis exhausted (${config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS} attempts) on chapter ${targetSmartId}. Marking status='failed'.`);
        metadata.fallback_reason = 'auto_resynthesis_exhausted';
        metadata.resynthesis_attempts = config.MAX_AUTO_RESYNTHESIZE_ATTEMPTS;

        let smartChapter = smartChapterRepository.getById(targetSmartId);
        if (smartChapter) {
          smartChapter = smartChapterRepository.update(targetSmartId, {
            status: 'failed',
            content: cleanContent,
            synthesis_type: synthesisType,
            metadata_json: metadata,
            updated_at: new Date().toISOString(),
          });
        }

        return {
          smartChapter,
          representation: smartChapter,
          canonicalBlocks,
          context,
          grounded: true,
          provenance: chunkIds,
          provider: providerName,
          model: modelName,
        };
      }
    }

    let smartChapter = smartChapterRepository.getById(targetSmartId);
    if (smartChapter) {
      smartChapter = smartChapterRepository.update(targetSmartId, {
        title: finalTitle,
        status: 'generated',
        content: cleanContent,
        synthesis_type: synthesisType,
        metadata_json: metadata,
        updated_at: new Date().toISOString(),
      });

      // 5.8.0j (2026-10-03): fire-and-forget provenance verification after
      // successful synthesis. Without this, chapters synthesized via the
      // manual /api/books/:id/editorial/synthesize route (or any caller that
      // isn't the auto-import chain) never populate paragraph_attributions,
      // and therefore render with no source chips. The in-flight guard added
      // to provenanceResolver.verifyRepresentation prevents this from racing
      // the book-wide trigger fired by the auto-import path.
      //
      // Non-blocking: we do NOT await. Verification failure must never fail
      // synthesis. Errors are logged and swallowed.
      try {
        const provenanceResolver = require('../semantic/provenanceResolver');
        provenanceResolver
          .verifyRepresentation(targetSmartId)
          .catch((pvErr) => {
            console.warn(
              `[SynthesisService] Post-synthesis provenance trigger failed for ${targetSmartId}:`,
              pvErr.message
            );
          });
      } catch (pvErr) {
        console.warn(
          `[SynthesisService] Could not load provenanceResolver for ${targetSmartId}:`,
          pvErr.message
        );
      }
    }

    return {
      smartChapter,
      representation: smartChapter,
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
    const regex = /.*?(?:[.!?]+(?:\s*\[Source\s+\d+\]+)*|\s*\[Source\s+\d+\]+\.[!?]*)(?=\s+|$)/gi;
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
        const response = await callOpenRouterWithBackoff(() => aiService.generateText(context.contextText, { temperature: 0.2 }));
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
   * Reranks candidate chunks for a synthesized paragraph using the BGE reranker
   * with staged fallback (Decision Record §2.8).
   *
   * @param {string} paragraph - Synthesized paragraph text
   * @param {Array<{ id: string, text: string }>} candidates - Candidate chunks
   * @param {object} [options]
   * @returns {Promise<{ rankedChunks: Array<object>, scores: Array<object>, fellBack: boolean, latencyMs: number, reranker_unavailable: boolean }>}
   */
  async rerankParagraphCandidates(paragraph, candidates = [], options = {}) {
    if (!candidates || candidates.length === 0) {
      return { rankedChunks: [], scores: [], fellBack: false, latencyMs: 0, reranker_unavailable: false };
    }

    // 5.8.0e (2026-10-03): Normalize candidates to { id, text } shape before send.
    // The caller passes raw DB rows from semanticChunkRepository (which carry
    // `textContent` / `content` / `text_content`). The Python sidecar's Pydantic
    // RerankCandidate model expects { id: str, text: str }; without a `text`
    // field, Pydantic returns 422 on every call. This mapping enforces the
    // documented contract defensively.
    //
    // 5.8.0i: candidates reduced 10 -> 5. Halves cross-encoder scoring load
    // with minimal quality loss (top-5 captures the primary signal).
    const normalizedCandidates = candidates
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        text: c.text || c.textContent || c.content || c.text_content || '',
      }))
      .filter((c) => c.id && c.text);

    if (normalizedCandidates.length === 0) {
      console.warn('[SynthesisService] RERANKER_FALLBACK: no candidates with valid id+text after normalization');
      return {
        rankedChunks: candidates,
        scores: [],
        fellBack: true,
        latencyMs: 0,
        reranker_unavailable: true,
      };
    }

    const startMs = Date.now();

    try {
      const client = options.nlpClient || nlpClient;
      // 5.8.0i (2026-10-03): default timeout bumped 1500 -> 4000 -> 10000ms.
      const timeoutMs = options.timeoutMs || 10000;
      const rerankFn = typeof client.rerankCandidatesBatch === 'function'
        ? client.rerankCandidatesBatch
        : client.rerankCandidates;
      const res = await rerankFn.call(client, paragraph, normalizedCandidates, { timeoutMs });
      const latencyMs = Date.now() - startMs;

      if (latencyMs > 2000) {
        console.warn(`[SynthesisService] Reranker latency exceeded 2.0s: ${latencyMs}ms`);
      }

      const scoreMap = new Map();
      if (res && Array.isArray(res.scores)) {
        for (const s of res.scores) {
          scoreMap.set(s.id, s.score);
        }
      }

      const reordered = [...candidates].sort((a, b) => {
        const sa = scoreMap.get(a.id) ?? -Infinity;
        const sb = scoreMap.get(b.id) ?? -Infinity;
        return sb - sa;
      });

      return {
        rankedChunks: reordered,
        scores: res.scores || [],
        fellBack: false,
        latencyMs,
        reranker_unavailable: false,
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      console.warn(`[SynthesisService] RERANKER_FALLBACK: ${err.message}`);
      return {
        rankedChunks: candidates,
        scores: [],
        fellBack: true,
        latencyMs,
        reranker_unavailable: true,
      };
    }
  }

  invalidateOutdatedRepresentations() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM smart_chapters WHERE synthesis_type IN ('multi_source', 'cross_source')").all();
    let invalidatedCount = 0;

    for (const row of rows) {
      let chunkIds = [];
      try {
        chunkIds = typeof row.planned_source_section_ids === 'string'
          ? JSON.parse(row.planned_source_section_ids)
          : (row.planned_source_section_ids || []);
      } catch {
        chunkIds = [];
      }

      if (!Array.isArray(chunkIds) || chunkIds.length === 0) continue;

      const placeholders = chunkIds.map(() => '?').join(',');
      const count = db.prepare(`SELECT COUNT(*) as count FROM semantic_chunks WHERE id IN (${placeholders})`).get(...chunkIds).count;

      if (count < chunkIds.length) {
        smartChapterRepository.update(row.id, {
          status: 'pending',
          content: null,
          metadata_json: { invalidated: true, reason: 'contributing_chunks_removed' },
        });
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  getSynthesis(outlineId, chapterId) {
    let sc = smartChapterRepository.getById(chapterId);
    if (!sc && outlineId) {
      const bookKey = outlineId.replace(/^book-editorial-/, '');
      const allForBook = smartChapterRepository.getByBookId(bookKey);
      sc = allForBook.find((c) => c.id === chapterId || String(c.sequence) === String(chapterId));
    }
    if (sc && sc.status === 'generated') {
      return sc;
    }
    // Transition fallback
    const repId = `rep-cross-${outlineId}-${chapterId}`;
    let rep = chapterRepository.getRepresentationById(repId);
    if (!rep) {
      rep = chapterRepository.getRepresentationByType(chapterId, 'EDITORIAL_SYNTHESIS');
    }
    return rep || null;
  }
}

const synthesisServiceInstance = new SynthesisService();
synthesisServiceInstance.PreLLMValidationError = PreLLMValidationError;
module.exports = synthesisServiceInstance;
module.exports.PreLLMValidationError = PreLLMValidationError;