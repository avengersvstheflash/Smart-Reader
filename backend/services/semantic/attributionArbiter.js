const aiService = require('../ai/aiService');

const C_HIGH_THRESHOLD = 0.65;
const C_MEDIUM_THRESHOLD = 0.45;
const C_LOW_THRESHOLD = 0.30;
const C_MARGIN_THRESHOLD = 0.10;

class AttributionArbiter {
  /**
   * Resolve paragraph-level attribution using C-primary arbitration.
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
    const cMargin = typeof C_signal.margin === 'number' ? C_signal.margin : Number((cTop1 - cTop2).toFixed(4));
    const cTop1Id = C_signal.top1ChunkId || (candidateChunkIds.length > 0 ? candidateChunkIds[0] : null);

    // Determine A status: A_valid, A_top1
    const aWeights = (A_claim && A_claim.weights) || {};
    const aKeys = Object.keys(aWeights);
    const aMissing = aKeys.length === 0;
    const aValid = !aMissing && aKeys.every((cid) => sourceChunkIdSet.has(cid));

    let aTop1 = null;
    let maxAWeight = -1;
    for (const [cid, w] of Object.entries(aWeights)) {
      if (typeof w === 'number' && w > maxAWeight) {
        maxAWeight = w;
        aTop1 = cid;
      }
    }

    const cTop1ChunkId = C_signal.top1ChunkId || (typeof C_signal.top1 === 'string' ? C_signal.top1 : cTop1Id);
    const aMatchesC = aValid && aTop1 !== null && (aTop1 === cTop1ChunkId || aTop1 === cTop1Id);

    // Rank C's candidate chunks and select top-3 chunks
    const sortedByC = [...candidateChunkIds].sort((a, b) => {
      if (a === cTop1Id) return -1;
      if (b === cTop1Id) return 1;
      const scoreA = (C_signal.weights && C_signal.weights[a]) || 0;
      const scoreB = (C_signal.weights && C_signal.weights[b]) || 0;
      return scoreB - scoreA;
    });

    const positiveChunks = sortedByC.filter((cid) => (C_signal.weights && C_signal.weights[cid] > 0));
    const cTop3ChunkIds = (positiveChunks.length > 0 ? positiveChunks : sortedByC).slice(0, 3);
    if (cTop3ChunkIds.length === 0 && cTop1Id) {
      cTop3ChunkIds.push(cTop1Id);
    }

    // Compute normalized weights for C's top-3 chunks
    const cTop3Weights = {};
    let sumC = 0;
    for (const cid of cTop3ChunkIds) {
      sumC += (C_signal.weights && C_signal.weights[cid]) || 0;
    }
    if (sumC > 0) {
      for (const cid of cTop3ChunkIds) {
        const w = (C_signal.weights && C_signal.weights[cid]) || 0;
        cTop3Weights[cid] = Number((w / sumC).toFixed(4));
      }
    } else if (cTop3ChunkIds.length > 0) {
      const eq = Number((1 / cTop3ChunkIds.length).toFixed(4));
      for (const cid of cTop3ChunkIds) {
        cTop3Weights[cid] = eq;
      }
    }

    // C's default answer for fallbacks / C-only decisions
    const cAnswer = {
      chunk_ids: cTop3ChunkIds,
      weights: cTop3Weights,
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
      console.log(`[AttributionArbiter] C.top1: ${cTop1.toFixed(4)}, C.margin: ${cMargin.toFixed(4)}, resolved method: ${result.method}`);
      return result;
    };

    // C-primary arbitration decision tree
    if (cTop1 >= C_HIGH_THRESHOLD && cMargin >= C_MARGIN_THRESHOLD) {
      return logAndReturn({
        method: 'c_primary',
        confidence: 'high',
        grounded: true,
        chunk_ids: cTop3ChunkIds,
        weights: cTop3Weights,
        fell_back: false,
        fallback_reason: null,
      });
    } else if (cTop1 >= C_MEDIUM_THRESHOLD) {
      if (aMatchesC) {
        return logAndReturn({
          method: 'c_verified_by_a',
          confidence: 'medium',
          grounded: true,
          chunk_ids: cTop3ChunkIds,
          weights: cTop3Weights,
          fell_back: false,
          fallback_reason: null,
        });
      } else {
        return logAndReturn(await fireSignalB('b_arbitrated', 'medium'));
      }
    } else if (cTop1 >= C_LOW_THRESHOLD && cTop1 < C_MEDIUM_THRESHOLD) {
      return logAndReturn(await fireSignalB('b_weak_c', 'low'));
    } else {
      return logAndReturn({
        method: 'ungrounded',
        confidence: 'none',
        grounded: false,
        chunk_ids: [],
        weights: {},
        fell_back: false,
        fallback_reason: null,
      });
    }
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
  \"chunk_ids\": [\"chunk_id_1\"],
  \"weights\": { \"chunk_id_1\": 1.0 }
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
