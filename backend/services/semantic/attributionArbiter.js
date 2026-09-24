const aiService = require('../ai/aiService');

/**
 * Computes cosine similarity between two numeric vectors
 */
function vectorCosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class AttributionArbiter {
  /**
   * Resolve paragraph-level attribution using the 8-case decision matrix.
   *
   * @param {object} params
   * @param {string} params.paragraph
   * @param {object} [params.A_claim] - { weights: { [chunkId]: number } }
   * @param {object} params.C_signal - { top1, top2, margin, top1ChunkId, weights: { [chunkId]: number } }
   * @param {Array<object>} params.source_chunks - array of candidate chunk objects { id, sectionHeading, textContent, ... }
   * @param {object} [params.options]
   * @returns {Promise<object>} { method, confidence, grounded, weights, chunk_ids, fell_back, fallback_reason }
   */
  async resolveParagraphAttribution({ paragraph, A_claim, C_signal, source_chunks = [], options = {} }) {
    const candidateChunks = Array.isArray(source_chunks) ? source_chunks : [];
    const candidateChunkIds = candidateChunks.map((c) => c.id);
    const sourceChunkIdSet = new Set(candidateChunkIds);

    const cTop1 = typeof C_signal.top1 === 'number' ? C_signal.top1 : 0;
    const cTop2 = typeof C_signal.top2 === 'number' ? C_signal.top2 : 0;
    const cMargin = typeof C_signal.margin === 'number' ? C_signal.margin : cTop1 - cTop2;
    const cTop1Id = C_signal.top1ChunkId || (candidateChunkIds.length > 0 ? candidateChunkIds[0] : null);

    // Case 8: C.top1 < 0.45 (Ungrounded floor)
    if (cTop1 < 0.45) {
      return {
        method: 'ungrounded',
        confidence: 'none',
        grounded: false,
        chunk_ids: [],
        weights: {},
        fell_back: false,
        fallback_reason: null,
      };
    }

    // Determine A status: A_missing vs A_valid vs !A_valid
    const aWeights = (A_claim && A_claim.weights) || {};
    const aKeys = Object.keys(aWeights);
    const aMissing = aKeys.length === 0;
    const aValid = !aMissing && aKeys.every((cid) => sourceChunkIdSet.has(cid));

    // Compute A_vs_C vector cosine similarity across candidate chunk IDs
    let aVsC = 0;
    if (!aMissing && candidateChunkIds.length > 0) {
      const vecA = candidateChunkIds.map((cid) => aWeights[cid] || 0);
      const vecC = candidateChunkIds.map((cid) => (C_signal.weights && C_signal.weights[cid]) || 0);
      aVsC = vectorCosineSimilarity(vecA, vecC);
    }

    // C's default answer for fallbacks / C-only decisions
    const cAnswer = {
      chunk_ids: cTop1Id ? [cTop1Id] : [],
      weights: cTop1Id ? { [cTop1Id]: 1.0 } : {},
    };

    // Helper to fire Signal B
    const fireSignalB = async (methodName, confidenceLevel) => {
      if (options.fast) {
        // Fast test mode skips LLM arbitration and falls back cleanly to C
        return {
          method: methodName,
          confidence: confidenceLevel,
          grounded: true,
          chunk_ids: cAnswer.chunk_ids,
          weights: cAnswer.weights,
          fell_back: true,
          fallback_reason: 'fast_path_bypass',
        };
      }

      try {
        const bResult = await this.callSignalB(paragraph, candidateChunks, C_signal, options);
        if (bResult && Array.isArray(bResult.chunk_ids) && bResult.chunk_ids.length > 0) {
          // Filter to valid chunks only
          const validBChunks = bResult.chunk_ids.filter((cid) => sourceChunkIdSet.has(cid));
          if (validBChunks.length > 0) {
            // Re-normalize weights
            const normWeights = {};
            let sumWeights = 0;
            for (const cid of validBChunks) {
              const w = typeof bResult.weights?.[cid] === 'number' ? bResult.weights[cid] : 1.0;
              sumWeights += w;
            }
            if (sumWeights <= 0) sumWeights = 1.0;
            for (const cid of validBChunks) {
              const w = typeof bResult.weights?.[cid] === 'number' ? bResult.weights[cid] : 1.0;
              normWeights[cid] = Number((w / sumWeights).toFixed(4));
            }

            return {
              method: methodName,
              confidence: confidenceLevel,
              grounded: true,
              chunk_ids: validBChunks,
              weights: normWeights,
              fell_back: false,
              fallback_reason: null,
            };
          }
        }
        // If B returned no valid chunks, fall back to C
        return {
          method: methodName,
          confidence: confidenceLevel,
          grounded: true,
          chunk_ids: cAnswer.chunk_ids,
          weights: cAnswer.weights,
          fell_back: true,
          fallback_reason: 'arbiter_unavailable',
        };
      } catch (err) {
        return {
          method: methodName,
          confidence: confidenceLevel,
          grounded: true,
          chunk_ids: cAnswer.chunk_ids,
          weights: cAnswer.weights,
          fell_back: true,
          fallback_reason: 'arbiter_unavailable',
        };
      }
    };

    const logAndReturn = (result) => {
      console.log(`[AttributionArbiter] A_vs_C: ${Number(aVsC.toFixed(4))}, resolved method: ${result.method}`);
      return result;
    };

    // Case 1: A_valid && A_vs_C >= 0.85
    if (aValid && aVsC >= 0.85) {
      return logAndReturn({
        method: 'a_verified_by_c',
        confidence: 'high',
        grounded: true,
        chunk_ids: aKeys,
        weights: aWeights,
        fell_back: false,
        fallback_reason: null,
      });
    }

    // Case 2: A_valid && 0.60 <= A_vs_C < 0.85
    if (aValid && aVsC >= 0.60) {
      return logAndReturn(await fireSignalB('b_arbitrated', 'medium'));
    }

    // Case 3: A_valid && A_vs_C < 0.60
    if (aValid && aVsC < 0.60) {
      return logAndReturn(await fireSignalB('b_replaced_a', 'medium'));
    }

    // Case 4: !A_valid && C_margin >= 0.15
    if (!aValid && !aMissing && cMargin >= 0.15) {
      return logAndReturn({
        method: 'c_only',
        confidence: 'medium',
        grounded: true,
        chunk_ids: cAnswer.chunk_ids,
        weights: cAnswer.weights,
        fell_back: false,
        fallback_reason: null,
      });
    }

    // Case 5: !A_valid && C_margin < 0.15
    if (!aValid && !aMissing && cMargin < 0.15) {
      return logAndReturn(await fireSignalB('b_after_invalid_a', 'low'));
    }

    // Case 6: A_missing && C_margin >= 0.15
    if (aMissing && cMargin >= 0.15) {
      return logAndReturn({
        method: 'c_only',
        confidence: 'medium',
        grounded: true,
        chunk_ids: cAnswer.chunk_ids,
        weights: cAnswer.weights,
        fell_back: false,
        fallback_reason: null,
      });
    }

    // Case 7: A_missing && C_margin < 0.15
    if (aMissing && cMargin < 0.15) {
      return logAndReturn(await fireSignalB('b_after_missing_a', 'low'));
    }

    // Default safety fallback (should never be reached given matrix coverage)
    return logAndReturn({
      method: 'c_only',
      confidence: 'low',
      grounded: true,
      chunk_ids: cAnswer.chunk_ids,
      weights: cAnswer.weights,
      fell_back: true,
      fallback_reason: 'default_matrix_fallback',
    });
  }

  /**
   * Signal B: LLM Arbitration call
   * Evaluates paragraph against top-5 candidate source chunks.
   * Retries once on failure.
   */
  async callSignalB(paragraph, candidateChunks, C_signal, options = {}) {
    // Select top-5 chunks by C similarity
    const sorted = [...candidateChunks].sort((a, b) => {
      const scoreA = C_signal.weights?.[a.id] || 0;
      const scoreB = C_signal.weights?.[b.id] || 0;
      return scoreB - scoreA;
    });
    const topCandidates = sorted.slice(0, 5);

    const passagesText = topCandidates
      .map((c) => `[Chunk ID: ${c.id} | Section: ${c.sectionHeading || c.sourceReference || 'Untitled'}]\n${c.textContent || ''}`)
      .join('\n\n---\n\n');

    const prompt = `You are an expert reading provenance arbiter.
Given a compressed Smart paragraph and candidate source passages from the original book, identify which source chunk(s) substantiate the factual claims in the paragraph.
Output valid JSON only with chunk_ids and normalized weights (summing to 1.0). Limit to max 2-3 chunk_ids.

SMART PARAGRAPH:
${paragraph}

CANDIDATE SOURCE PASSAGES:
${passagesText}

OUTPUT JSON ONLY:
{
  "chunk_ids": ["chunk_id_1"],
  "weights": { "chunk_id_1": 1.0 }
}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const provider = aiService.getActiveProvider();
        const health = await provider.checkHealth();
        if (!health || !health.available) break;

        const timeoutMs = options.timeout || 15000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Signal B timeout')), timeoutMs)
        );

        const response = await Promise.race([
          aiService.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 400,
            reasoning: { enabled: false },
          }),
          timeoutPromise,
        ]);

        const raw = (response && response.text) || '';
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && Array.isArray(parsed.chunk_ids) && parsed.chunk_ids.length > 0) {
          return parsed;
        }
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }

    throw new Error('Signal B failed after 2 attempts');
  }
}

module.exports = new AttributionArbiter();

