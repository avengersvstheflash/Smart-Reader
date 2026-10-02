const embeddingService = require('./embeddingService');
const attributionArbiter = require('./attributionArbiter');
const chapterRepository = require('../../repositories/chapterRepository');
const smartChapterRepository = require('../../repositories/smartChapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const outlineRepository = require('../../repositories/outlineRepository');
const jobRepository = require('../../repositories/jobRepository');
const attributionRepository = require('../../repositories/attributionRepository');

/**
 * Split paragraph into sentences, abbreviation-aware.
 * Phase 5.5e.1: Correct splitter over-clumping regression. Handles strong abbreviations,
 * initials, and boundary punctuation without swallowing sentence-ending single-letter variables
 * (e.g. math clauses) or terminal abbreviations (e.g. etc.).
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/\s*\[Source\s+\d+\]/gi, '').trim();
  if (!cleaned) return [];

  const STRONG_ABBREVIATIONS = new Set([
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'sr.', 'jr.',
    'e.g.', 'i.e.', 'vs.', 'cf.', 'fig.', 'eq.', 'no.', 'ch.', 'sec.', 'vol.',
    'approx.', 'ca.', 'dept.', 'est.', 'inc.', 'corp.', 'ltd.', 'co.'
  ]);

  const out = [];
  let start = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    let j = i + 1;
    while (j < cleaned.length && /[.!?]/.test(cleaned[j])) j++;

    if (j >= cleaned.length) break;
    if (!/\s/.test(cleaned[j])) { i = j - 1; continue; }

    let k = j;
    while (k < cleaned.length && /\s/.test(cleaned[k])) k++;
    if (k >= cleaned.length) break;

    const next = cleaned[k];
    if (!/[A-Z0-9"'([]/.test(next)) { i = j - 1; continue; }

    const before = cleaned.slice(0, i);
    const lastSpace = Math.max(
      before.lastIndexOf(' '),
      before.lastIndexOf('\n'),
      before.lastIndexOf('\t')
    );
    const token = (lastSpace >= 0 ? before.slice(lastSpace + 1) : before).toLowerCase();

    if (STRONG_ABBREVIATIONS.has(token + '.')) { i = j - 1; continue; }

    if (/^[a-z]$/.test(token)) {
      const prev = lastSpace >= 0 ? before.slice(0, lastSpace).trim() : '';
      const prevWord = (prev.split(/\s+/).pop() || '').toLowerCase();
      const isPrevInitial = /^[a-z]\.$/.test(prevWord) && !STRONG_ABBREVIATIONS.has(prevWord);
      const isNextInitial = /^[A-Z]\./.test(cleaned.slice(k));

      if (isPrevInitial || isNextInitial) {
        i = j - 1;
        continue;
      }
    }

    out.push(cleaned.slice(start, j).trim());
    start = k;
    i = k - 1;
  }
  const tail = cleaned.slice(start).trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : [cleaned];
}

const MULTI_CHUNK_DELTA_THRESHOLD = 0.08;
const SINGLE_SENTENCE_WEIGHT_FLOOR = 0.25;

function haveSameChunks(arr1, arr2) {
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;
  const s1 = [...arr1].sort().join(',');
  const s2 = [...arr2].sort().join(',');
  return s1 === s2;
}

class ProvenanceResolver {
  /**
   * Resolve paragraph-level provenance and sentence-level segmentation for an EDITORIAL_SYNTHESIS representation
   *
   * @param {string} representationId
   * @param {object} options - { force: boolean, jobId: string, fast: boolean }
   * @returns {Promise<object>}
   */
  async verifyRepresentation(representationId, options = {}) {
    let rep = smartChapterRepository.getById(representationId);
    if (!rep) {
      rep = chapterRepository.getRepresentationById(representationId);
    }
    if (!rep) {
      throw new Error(`Representation not found: ${representationId}`);
    }

    // Idempotency check: if attributions exist and not forced, return existing
    const existing = attributionRepository.getBySmartChapterId(representationId);
    if (existing.length > 0 && !options.force) {
      return {
        representation_id: representationId,
        verified_at: existing[0].verified_at,
        paragraphs: existing,
      };
    }

    const ownJob = !options.jobId && !options.skipJobCreation;
    const jobId = options.jobId || `job-provenance-${representationId}-${Date.now()}`;
    const bookId = rep.book_id || rep.bookId;

    if (ownJob) {
      jobRepository.create({
        id: jobId,
        book_id: bookId,
        type: 'PROVENANCE_VERIFY',
        status: 'PROCESSING',
        progress: 10,
      });
    }

    try {
      if (options.force && existing.length > 0) {
        attributionRepository.deleteBySmartChapterId(representationId);
      }

      // 1. Load candidate source chunks
      let chunkIds = [];
      if (Array.isArray(rep.planned_source_section_ids) && rep.planned_source_section_ids.length > 0) {
        chunkIds = rep.planned_source_section_ids;
      } else if (Array.isArray(rep.sourceSectionIds) && rep.sourceSectionIds.length > 0) {
        chunkIds = rep.sourceSectionIds;
      } else if (Array.isArray(rep.provenance) && rep.provenance.length > 0) {
        chunkIds = rep.provenance;
      } else if (rep.metadata && Array.isArray(rep.metadata.provenance) && rep.metadata.provenance.length > 0) {
        chunkIds = rep.metadata.provenance;
      }

      // Fallback to outline if chunkIds are empty
      if (chunkIds.length === 0 && rep.metadata && rep.metadata.outlineId) {
        const outline = outlineRepository.getById(rep.metadata.outlineId);
        if (outline && Array.isArray(outline.chapters)) {
          const ch = outline.chapters.find((c) => c.chapterId === rep.chapter_id || c.id === rep.chapter_id);
          if (ch && Array.isArray(ch.sourceSectionIds)) {
            chunkIds = ch.sourceSectionIds;
          }
        }
      }

      let candidateChunks = [];
      for (const cid of chunkIds) {
        const chunk = semanticChunkRepository.getById(cid);
        if (chunk) {
          candidateChunks.push(chunk);
        }
      }

      // If still no chunks, load general chunks for the book
      if (candidateChunks.length === 0 && bookId) {
        candidateChunks = semanticChunkRepository.getByBookId(bookId) || [];
      }

      // Ensure all candidate chunks have embeddings
      for (const chunk of candidateChunks) {
        if (!chunk.embedding || !Array.isArray(chunk.embedding) || chunk.embedding.length !== embeddingService.getDimension()) {
          chunk.embedding = await embeddingService.embedChunk(chunk);
        }
      }

      // 2. Load Smart Chapter content and split into paragraphs
      const content = rep.content || '';
      const rawParagraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

      if (jobId) {
        jobRepository.update(jobId, { progress: ownJob ? 30 : 50 });
      }

      // Extract claimed attributions (Signal A) from representation metadata
      const claimedList = (rep.metadata && rep.metadata.claimed_attributions) || [];
      const claimedMap = new Map();
      for (const item of claimedList) {
        if (typeof item.paragraph_index === 'number') {
          claimedMap.set(item.paragraph_index, item);
        }
      }

      const attributionRecords = [];
      const totalParas = Math.max(1, rawParagraphs.length);

      // 3. For each paragraph: compute C signal, run arbiter, and segment sentences
      for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
        const paraText = rawParagraphs[pIdx];

        // 3a. Signal C: Embed paragraph and compute similarity to candidate chunks
        let C_signal = {
          top1: 0,
          top2: 0,
          margin: 0,
          top1ChunkId: candidateChunks[0]?.id || null,
          weights: {},
        };

        if (candidateChunks.length > 0) {
          const paraVec = await embeddingService.embedText(paraText);
          const chunkScores = [];

          for (const chunk of candidateChunks) {
            const sim = chunk.embedding ? embeddingService.cosineSimilarity(paraVec, chunk.embedding) : 0;
            chunkScores.push({ id: chunk.id, sim: Number(sim.toFixed(4)) });
          }

          // Sort descending by similarity
          chunkScores.sort((a, b) => b.sim - a.sim);

          const top1 = chunkScores[0]?.sim || 0;
          const top2 = chunkScores[1]?.sim || 0;
          const margin = Number((top1 - top2).toFixed(4));

          // Compute normalized positive weights for C
          const positiveScores = chunkScores.map((s) => ({ id: s.id, pos: Math.max(0, s.sim) }));
          const totalPos = positiveScores.reduce((acc, s) => acc + s.pos, 0);
          const cWeights = {};
          for (const s of positiveScores) {
            cWeights[s.id] = totalPos > 0 ? Number((s.pos / totalPos).toFixed(4)) : 0;
          }

          C_signal = {
            top1,
            top2,
            margin,
            top1ChunkId: chunkScores[0]?.id || null,
            weights: cWeights,
          };
        }

        // 3b. Run decision matrix arbiter
        const A_claim = claimedMap.get(pIdx) || null;
        const arbiterResult = await attributionArbiter.resolveParagraphAttribution({
          paragraph: paraText,
          A_claim,
          C_signal,
          source_chunks: candidateChunks,
          options,
        });

        // 3c. Sentence-level segmentation pass
        const sentences = splitIntoSentences(paraText);
        const resolvedChunkIds = arbiterResult.chunk_ids || [];
        let segments = [];

        // 3c-bis. Reranker/centroid stage: consume write-time reranker_scores
        // and replace the resolved chunk set with the anchor + delta-included
        // chunks. Emits a single paragraph-level segment.
        const attributionStage = A_claim?.weights_json?.attribution_stage || 'legacy';
        const rerankerScores = A_claim?.reranker_scores || {};
        const hasRerankerSignal =
          (attributionStage === 'reranker' || attributionStage === 'centroid') &&
          Object.keys(rerankerScores).length > 0;

        if (hasRerankerSignal) {
          let anchorId = null;
          let anchorScore = -Infinity;
          for (const [cid, score] of Object.entries(rerankerScores)) {
            if (score > anchorScore) {
              anchorScore = score;
              anchorId = cid;
            }
          }
          const deltaIncluded = Object.entries(rerankerScores)
            .filter(([_cid, score]) => (anchorScore - score) <= MULTI_CHUNK_DELTA_THRESHOLD)
            .map(([cid]) => cid);
          const finalChunkIds = deltaIncluded.length > 0
            ? deltaIncluded
            : (anchorId ? [anchorId] : resolvedChunkIds);
          arbiterResult.chunk_ids = finalChunkIds;
          const paraConfidence = anchorScore !== -Infinity
            ? Number(anchorScore.toFixed(4))
            : Number((C_signal.top1 || 0.9).toFixed(4));
          segments.push({
            sentence_start: 0,
            sentence_end: Math.max(0, sentences.length - 1),
            chunk_id: anchorId || finalChunkIds[0],
            chunk_ids: finalChunkIds,
            confidence: paraConfidence,
          });
        } else if (sentences.length > 0 && resolvedChunkIds.length > 0) {
          if (resolvedChunkIds.length === 1) {
            // Entire paragraph maps to single chunk
            segments.push({
              sentence_start: 0,
              sentence_end: sentences.length - 1,
              chunk_id: resolvedChunkIds[0],
              chunk_ids: [resolvedChunkIds[0]],
              confidence: Number((C_signal.top1 || 0.9).toFixed(4)),
            });
          } else if (sentences.length === 1) {
            // Single-sentence paragraph: inherit all qualifying paragraph chunks with weight >= SINGLE_SENTENCE_WEIGHT_FLOOR
            const qualifyingCids = resolvedChunkIds.filter((cid) => {
              const w = arbiterResult.weights?.[cid] || 0;
              return w >= SINGLE_SENTENCE_WEIGHT_FLOOR;
            });
            const assignedChunkIds = qualifyingCids.length > 0 ? qualifyingCids : resolvedChunkIds;
            segments.push({
              sentence_start: 0,
              sentence_end: 0,
              chunk_id: resolvedChunkIds[0],
              chunk_ids: assignedChunkIds,
              confidence: Number((C_signal.top1 || 0.9).toFixed(4)),
            });
          } else {
            // Map each sentence to qualifying chunks within MULTI_CHUNK_DELTA_THRESHOLD
            const resolvedChunks = candidateChunks.filter((c) => resolvedChunkIds.includes(c.id));
            const sentenceAttributions = [];

            for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
              const sentText = sentences[sIdx];
              const sentVec = await embeddingService.embedText(sentText);
              const chunkScores = [];

              for (const ch of resolvedChunks) {
                const sim = ch.embedding ? embeddingService.cosineSimilarity(sentVec, ch.embedding) : 0;
                chunkScores.push({ id: ch.id, score: sim });
              }

              chunkScores.sort((a, b) => b.score - a.score);

              const bestScore = chunkScores[0]?.score || 0;
              const bestCid = chunkScores[0]?.id || resolvedChunkIds[0];
              const assignedChunkIds = chunkScores
                .filter((cs) => (bestScore - cs.score) <= MULTI_CHUNK_DELTA_THRESHOLD)
                .map((cs) => cs.id);

              sentenceAttributions.push({
                sIdx,
                chunk_id: bestCid,
                chunk_ids: assignedChunkIds.length > 0 ? assignedChunkIds : [bestCid],
                score: Number(bestScore.toFixed(4)),
              });
            }

            // Group contiguous runs with identical chunk_ids
            let currentRun = {
              sentence_start: 0,
              sentence_end: 0,
              chunk_id: sentenceAttributions[0].chunk_id,
              chunk_ids: sentenceAttributions[0].chunk_ids,
              confidence: sentenceAttributions[0].score,
            };

            for (let sIdx = 1; sIdx < sentenceAttributions.length; sIdx++) {
              const sa = sentenceAttributions[sIdx];
              if (haveSameChunks(sa.chunk_ids, currentRun.chunk_ids)) {
                currentRun.sentence_end = sIdx;
                currentRun.confidence = Math.max(currentRun.confidence, sa.score);
              } else {
                segments.push(currentRun);
                currentRun = {
                  sentence_start: sIdx,
                  sentence_end: sIdx,
                  chunk_id: sa.chunk_id,
                  chunk_ids: sa.chunk_ids,
                  confidence: sa.score,
                };
              }
            }
            segments.push(currentRun);
          }
        }

        attributionRecords.push({
          id: `attr-${representationId}-${pIdx}`,
          smart_chapter_id: representationId,
          representation_id: representationId,
          paragraph_index: pIdx,
          segments,
          source_chunk_ids: arbiterResult.chunk_ids,
          weights: arbiterResult.weights,
          weights_json: A_claim?.weights_json || { attribution_stage: 'legacy' },
          method: arbiterResult.method,
          confidence: arbiterResult.confidence,
          grounded: arbiterResult.grounded,
          verified_at: new Date().toISOString(),
          fell_back: arbiterResult.fell_back,
          fallback_reason: arbiterResult.fallback_reason,
          reranker_scores: A_claim?.reranker_scores || {},
        });

        if (jobId) {
          const pct = Math.round(30 + ((pIdx + 1) / totalParas) * 60);
          jobRepository.update(jobId, { progress: pct });
        }
      }

      // 4. Batch persist attributions into SQLite
      const saved = attributionRepository.createBatch(attributionRecords);

      if (ownJob) {
        jobRepository.complete(jobId);
      }

      return {
        smart_chapter_id: representationId,
        representation_id: representationId,
        verified_at: attributionRecords[0]?.verified_at || new Date().toISOString(),
        paragraphs: saved,
      };
    } catch (err) {
      if (ownJob) {
        jobRepository.fail(jobId, err);
      }
      throw err;
    }
  }

  /**
   * Trigger provenance verification across all editorial representations for a book
   *
   * @param {string} bookId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async triggerVerificationForBook(bookId, options = {}) {
    let targets = smartChapterRepository.getGeneratedByBookId(bookId);
    if (!targets || targets.length === 0) {
      const reps = chapterRepository.getRepresentationsByBook(bookId);
      targets = reps.filter((r) => r.type === 'EDITORIAL_SYNTHESIS');
    }

    if (targets.length === 0) {
      return { bookId, verifiedCount: 0, message: 'No generated smart chapters to verify' };
    }

    const jobId = `job-verify-book-${bookId}-${Date.now()}`;
    jobRepository.create({
      id: jobId,
      book_id: bookId,
      type: 'PROVENANCE_VERIFY',
      status: 'PROCESSING',
      progress: 0,
    });

    try {
      let verifiedCount = 0;
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        await this.verifyRepresentation(target.id, {
          jobId,
          skipJobCreation: true,
          ...options,
        });
        verifiedCount++;
        const pct = Math.round(((i + 1) / targets.length) * 100);
        jobRepository.update(jobId, { progress: Math.min(pct, 95) });
      }

      jobRepository.complete(jobId);
      return { bookId, verifiedCount, status: 'COMPLETED' };
    } catch (err) {
      jobRepository.fail(jobId, err);
      throw err;
    }
  }

  /**
   * Get formatted provenance response for a representation
   *
   * @param {string} representationId
   * @returns {object}
   */
  getProvenance(representationId) {
    const rows = attributionRepository.getBySmartChapterId(representationId);
    if (!rows || rows.length === 0) {
      return {
        smart_chapter_id: representationId,
        representation_id: representationId,
        verified_at: null,
        paragraphs: [],
      };
    }

    return {
      smart_chapter_id: representationId,
      representation_id: representationId,
      verified_at: rows[0].verified_at,
      paragraphs: rows.map((r) => ({
        paragraph_index: r.paragraph_index,
        segments: r.segments,
        source_chunk_ids: r.source_chunk_ids,
        weights: r.weights,
        method: r.method,
        confidence: r.confidence,
        grounded: r.grounded,
      })),
    };
  }
}

const instance = new ProvenanceResolver();
instance.splitIntoSentences = splitIntoSentences;
instance.MULTI_CHUNK_DELTA_THRESHOLD = MULTI_CHUNK_DELTA_THRESHOLD;
instance.SINGLE_SENTENCE_WEIGHT_FLOOR = SINGLE_SENTENCE_WEIGHT_FLOOR;
module.exports = instance;