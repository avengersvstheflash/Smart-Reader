const embeddingService = require('./embeddingService');
const attributionArbiter = require('./attributionArbiter');
const chapterRepository = require('../../repositories/chapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const outlineRepository = require('../../repositories/outlineRepository');
const jobRepository = require('../../repositories/jobRepository');
const attributionRepository = require('../../repositories/attributionRepository');

/**
 * Split paragraph into sentences preserving natural boundaries
 */
function splitIntoSentences(text) {
  const t = (text || '').trim();
  if (!t) return [];
  const regex = /.*?(?:[.!?]+(?:\s*\[Source\s+\d+\]+)*|\s*\[Source\s+\d+\]+[.!?]*)(?=\s+|$)/gi;
  const matches = t.match(regex);
  if (!matches || matches.length === 0) return [t];
  const sents = matches
    .map((s) => s.trim().replace(/\s*\[Source\s+\d+\]/gi, '').trim())
    .filter(Boolean);
  return sents.length > 0 ? sents : [t];
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
    const rep = chapterRepository.getRepresentationById(representationId);
    if (!rep) {
      throw new Error(`Representation not found: ${representationId}`);
    }

    // Idempotency check: if attributions exist and not forced, return existing
    const existing = attributionRepository.getByRepresentationId(representationId);
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
        attributionRepository.deleteByRepresentationId(representationId);
      }

      // 1. Load candidate source chunks
      let chunkIds = [];
      if (Array.isArray(rep.provenance) && rep.provenance.length > 0) {
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

        if (sentences.length > 0 && resolvedChunkIds.length > 0) {
          if (resolvedChunkIds.length === 1) {
            // Entire paragraph maps to single chunk
            segments.push({
              sentence_start: 0,
              sentence_end: sentences.length - 1,
              chunk_id: resolvedChunkIds[0],
              confidence: Number((C_signal.top1 || 0.9).toFixed(4)),
            });
          } else {
            // Map each sentence to top chunk among resolved chunk set
            const resolvedChunks = candidateChunks.filter((c) => resolvedChunkIds.includes(c.id));
            const sentenceAttributions = [];

            for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
              const sentText = sentences[sIdx];
              const sentVec = await embeddingService.embedText(sentText);
              let bestCid = resolvedChunkIds[0];
              let bestScore = -1;

              for (const ch of resolvedChunks) {
                const sim = ch.embedding ? embeddingService.cosineSimilarity(sentVec, ch.embedding) : 0;
                if (sim > bestScore) {
                  bestScore = sim;
                  bestCid = ch.id;
                }
              }

              sentenceAttributions.push({
                sIdx,
                chunk_id: bestCid,
                score: Number(bestScore.toFixed(4)),
              });
            }

            // Group contiguous runs with the same chunk_id
            let currentRun = {
              sentence_start: 0,
              sentence_end: 0,
              chunk_id: sentenceAttributions[0].chunk_id,
              confidence: sentenceAttributions[0].score,
            };

            for (let sIdx = 1; sIdx < sentenceAttributions.length; sIdx++) {
              const sa = sentenceAttributions[sIdx];
              if (sa.chunk_id === currentRun.chunk_id) {
                currentRun.sentence_end = sIdx;
                currentRun.confidence = Math.max(currentRun.confidence, sa.score);
              } else {
                segments.push(currentRun);
                currentRun = {
                  sentence_start: sIdx,
                  sentence_end: sIdx,
                  chunk_id: sa.chunk_id,
                  confidence: sa.score,
                };
              }
            }
            segments.push(currentRun);
          }
        }

        attributionRecords.push({
          id: `attr-${representationId}-${pIdx}`,
          representation_id: representationId,
          paragraph_index: pIdx,
          segments,
          source_chunk_ids: arbiterResult.chunk_ids,
          weights: arbiterResult.weights,
          method: arbiterResult.method,
          confidence: arbiterResult.confidence,
          grounded: arbiterResult.grounded,
          verified_at: new Date().toISOString(),
          fell_back: arbiterResult.fell_back,
          fallback_reason: arbiterResult.fallback_reason,
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
    const reps = chapterRepository.getRepresentationsByBook(bookId);
    const editorialReps = reps.filter((r) => r.type === 'EDITORIAL_SYNTHESIS');

    if (editorialReps.length === 0) {
      return { bookId, verifiedCount: 0, message: 'No EDITORIAL_SYNTHESIS representations to verify' };
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
      for (let i = 0; i < editorialReps.length; i++) {
        const rep = editorialReps[i];
        await this.verifyRepresentation(rep.id, {
          jobId,
          skipJobCreation: true,
          ...options,
        });
        verifiedCount++;
        const pct = Math.round(((i + 1) / editorialReps.length) * 100);
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
    const rows = attributionRepository.getByRepresentationId(representationId);
    if (!rows || rows.length === 0) {
      return {
        representation_id: representationId,
        verified_at: null,
        paragraphs: [],
      };
    }

    return {
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

module.exports = new ProvenanceResolver();

