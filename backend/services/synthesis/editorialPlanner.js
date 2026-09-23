/**
 * Content-Aware Editorial Planner (Build 4.2a)
 *
 * Content-Feeding Strategy: Option A (Candidate section content excerpting)
 * Justification:
 *   For each candidate section, retrieve actual prose excerpts (~200 words / ~1000 chars)
 *   from candidate section text or top semantic chunks. This provides the Light LLM with
 *   real narrative and conceptual arguments for content-aware organization without risking
 *   context window overflow or incurring the latency and cost of preparatory LLM summarization calls.
 */

const sectionFilter = require('./sectionFilter');
const redundancyDetector = require('./redundancyDetector');

class EditorialPlanner {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.aiService = options.aiService || null;
  }

  getAIService() {
    if (this.aiService) return this.aiService;
    try {
      return require('../ai/aiService');
    } catch {
      return null;
    }
  }

  /**
   * Selects organization strategy based on content type and source scope
   * @param {string} contentType
   * @param {boolean} isMultiSource
   * @returns {'chronological'|'thematic'|'conceptual'|'argumentative'|'narrative'|'methodological'|'hybrid'}
   */
  selectStrategy(contentType = '', isMultiSource = false) {
    const type = String(contentType || '').toLowerCase().trim();

    if (type === 'novel' || type === 'narrative' || type === 'fiction') {
      return 'chronological';
    }

    if (type === 'textbook') {
      return 'conceptual';
    }

    if (type === 'history' || type === 'historical') {
      return 'chronological';
    }

    if (type === 'research' && !isMultiSource) {
      return 'methodological';
    }

    if (type === 'dossier' || isMultiSource || type === 'research') {
      return 'thematic';
    }

    return 'thematic';
  }

  /**
   * Helper to extract ~200 words of substantive prose excerpt from section content/summary/chunks
   * (Option A strategy implementation)
   */
  extractContentExcerpt(sec) {
    if (!sec) return '';
    let text = sec.content || sec.textContent || sec.summary || '';

    // If text is thin or missing, inspect chunk repository if sectionId is present
    if ((!text || text.trim().length < 50) && sec.sectionId) {
      try {
        const semanticChunkRepo = require('../../repositories/semanticChunkRepository');
        const chunk = semanticChunkRepo.getById(sec.sectionId);
        if (chunk && chunk.textContent) {
          text = chunk.textContent;
        }
      } catch {}
    }

    if (!text || typeof text !== 'string') return '';

    // Clean whitespace and isolate approximately 200 words (~1,000–1,200 chars)
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 200) {
      return words.join(' ');
    }
    return words.slice(0, 200).join(' ') + '...';
  }

  /**
   * Slices candidate sections/chunks into evenly distributed source units of ~1,500–2,500 words.
   * Algorithm (Phase 4.8.3):
   *  a. Computes totalBodyWords W = sum of all section/chunk word counts
   *  b. Computes N = max(1, round(W / 2000))
   *  c. Computes ideal unit size S = W / N
   *  d. Walks sections tracking cumulative words
   *  e. For each boundary i (1 to N-1), snaps to nearest chapter break within ±10% of S,
   *     or closest section boundary if none
   *  f. Produces exactly N units
   */
  sliceIntoSourceUnits(sections = []) {
    if (!Array.isArray(sections) || sections.length === 0) {
      return [];
    }

    const getWordCount = (sec) => {
      if (typeof sec.wordCount === 'number' && sec.wordCount > 0) {
        return sec.wordCount;
      }
      if (sec.content || sec.textContent) {
        return (sec.content || sec.textContent).trim().split(/\s+/).filter(Boolean).length;
      }
      return 250;
    };

    // Phase 4.24: Flatten any section whose wordCount exceeds 2500 into multiple sub-sections
    const flattenedSections = [];
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];
      const secWords = getWordCount(sec);
      if (secWords <= 2500) {
        flattenedSections.push(sec);
        continue;
      }

      const originalSectionId = sec.sectionId || sec.id || `section-${sIdx}`;
      const text = (sec.content || sec.textContent || '').trim();

      if (!text) {
        const targetCount = Math.ceil(secWords / 2000);
        const pieceSize = Math.floor(secWords / targetCount);
        let remaining = secWords;
        for (let pIdx = 0; pIdx < targetCount; pIdx++) {
          const pieceWords = (pIdx === targetCount - 1) ? remaining : pieceSize;
          remaining -= pieceWords;
          flattenedSections.push({
            ...sec,
            sectionId: `${originalSectionId}-p${pIdx}`,
            ...(sec.id ? { id: `${originalSectionId}-p${pIdx}` } : {}),
            wordCount: pieceWords,
          });
        }
        continue;
      }

      // Split at paragraph boundaries (\n\n)
      let paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      if (paragraphs.length === 0) {
        paragraphs = [text];
      }

      // If a paragraph is itself >2500 words, split at sentence boundaries ([.!?] followed by whitespace)
      const blocks = [];
      for (const para of paragraphs) {
        const paraWords = para.split(/\s+/).filter(Boolean).length;
        if (paraWords <= 2500) {
          blocks.push({ text: para, words: paraWords });
        } else {
          const sentences = para.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
          for (const sentence of sentences) {
            const sentWords = sentence.split(/\s+/).filter(Boolean).length;
            if (sentWords <= 2500) {
              blocks.push({ text: sentence, words: sentWords });
            } else {
              const words = sentence.split(/\s+/).filter(Boolean);
              for (let w = 0; w < words.length; w += 2000) {
                const subWords = words.slice(w, w + 2000);
                blocks.push({ text: subWords.join(' '), words: subWords.length });
              }
            }
          }
        }
      }

      let currentPieceBlocks = [];
      let currentPieceWords = 0;
      let pieceIndex = 0;

      const emitPiece = (blocksToEmit, wordsCount) => {
        const pieceText = blocksToEmit.map(b => b.text).join('\n\n');
        const piece = {
          ...sec,
          sectionId: `${originalSectionId}-p${pieceIndex}`,
          ...(sec.id ? { id: `${originalSectionId}-p${pieceIndex}` } : {}),
          wordCount: wordsCount,
        };
        if (sec.content !== undefined) piece.content = pieceText;
        if (sec.textContent !== undefined) piece.textContent = pieceText;
        if (sec.content === undefined && sec.textContent === undefined) {
          piece.content = pieceText;
          piece.textContent = pieceText;
        }
        flattenedSections.push(piece);
        pieceIndex++;
      };

      for (const block of blocks) {
        if (currentPieceWords > 0 && currentPieceWords + block.words > 2500) {
          emitPiece(currentPieceBlocks, currentPieceWords);
          currentPieceBlocks = [block];
          currentPieceWords = block.words;
        } else {
          currentPieceBlocks.push(block);
          currentPieceWords += block.words;
        }
      }

      if (currentPieceBlocks.length > 0) {
        emitPiece(currentPieceBlocks, currentPieceWords);
      }
    }

    sections = flattenedSections;

    const sectionWords = sections.map(getWordCount);
    const W = sectionWords.reduce((sum, w) => sum + w, 0);

    // For thin content (W < 3000 words), single section, or small source: produce 1 unit
    const N = Math.min(sections.length, Math.max(1, Math.round(W / 2000)));
    if (N <= 1) {
      return [{
        sections: [...sections],
        wordCount: W,
      }];
    }

    const S = W / N;

    // Cumulative words: cumWords[k] = total words before index k
    const cumWords = new Array(sections.length + 1);
    cumWords[0] = 0;
    for (let i = 0; i < sections.length; i++) {
      cumWords[i + 1] = cumWords[i] + sectionWords[i];
    }

    const splits = [0];
    for (let i = 1; i < N; i++) {
      const target = i * S;
      const minIdx = splits[i - 1] + 1;
      const maxIdx = sections.length - (N - i);

      let bestK = minIdx;
      let bestDist = Math.abs(cumWords[minIdx] - target);
      let chapterBreakK = null;
      let chapterBreakDist = Infinity;

      for (let k = minIdx; k <= maxIdx; k++) {
        const dist = Math.abs(cumWords[k] - target);
        if (dist < bestDist) {
          bestDist = dist;
          bestK = k;
        }

        const secTitle = (sections[k]?.sectionTitle || sections[k]?.title || '').trim();
        const isChapterBreak = /^(?:chapter|part)\s+\d+/i.test(secTitle);
        if (isChapterBreak && dist <= 0.10 * S) {
          if (dist < chapterBreakDist) {
            chapterBreakDist = dist;
            chapterBreakK = k;
          }
        }
      }

      splits.push(chapterBreakK !== null ? chapterBreakK : bestK);
    }
    splits.push(sections.length);

    const units = [];
    for (let i = 0; i < N; i++) {
      const unitSections = sections.slice(splits[i], splits[i + 1]);
      const unitWords = unitSections.reduce((sum, s, idx) => sum + sectionWords[splits[i] + idx], 0);
      units.push({
        sections: unitSections,
        wordCount: unitWords,
      });
    }

    return units;
  }

  /**
   * Calculate targetWordCount for a planned chapter based on mapped source sections
   * Task 4 Rules:
   * - Target ~1,500–3,000 words per chapter
   * - Sum of wordCounts of mapped source sections divided by compression ratio (0.4)
   * - Clamp to [1500, 3000]. If material is thin, allow shorter down to minimum 400 words.
   * - Do NOT pad to reach target.
   * Rules:
   * - targetWordCount = round(sourceUnitWordCount / 7)
   * - Clamp to [250, 360]
   * - If source unit < 1,200 words: targetWordCount = 180 (honest short chapter)
   * - If source unit > 2,800 words: log a warning
   */
  computeChapterWordBudget(sourceSectionIds = [], sectionLookup = new Map()) {
    let rawSourceWordCount = 0;
    for (const sid of sourceSectionIds) {
      const sec = sectionLookup.get(sid);
      if (sec) {
        if (typeof sec.wordCount === 'number' && sec.wordCount > 0) {
          rawSourceWordCount += sec.wordCount;
        } else if (sec.content) {
          rawSourceWordCount += sec.content.split(/\s+/).filter(Boolean).length;
        } else if (sec.content || sec.textContent) {
          rawSourceWordCount += (sec.content || sec.textContent).split(/\s+/).filter(Boolean).length;
        } else {
          rawSourceWordCount += 250; // reasonable baseline estimate per section
        }
      }
    }

    const compressionRatio = 0.15;
    const estimatedWords = Math.round(rawSourceWordCount * compressionRatio);
    if (rawSourceWordCount < 1200) {
      return 180;
    }
    if (rawSourceWordCount > 2800) {
      this.logger.warn(`[EditorialPlanner] Source unit exceeds 2800 words (${rawSourceWordCount})`);
      this.logger.error(`[EditorialPlanner] Source unit exceeds 2800 words (${rawSourceWordCount})`);
    }

    if (estimatedWords < 250) {
      // Thin material: allow shorter, down to minimum 180 words
      return Math.max(180, estimatedWords);
    }
    // Substantial material: clamp to [250, 360]
    return Math.min(360, estimatedWords);
    const target = Math.round(rawSourceWordCount / 7);
    return Math.max(250, Math.min(360, target));
  }

  /**
   * Main planning entry point
   * @param {object} input
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async plan(input = {}, options = {}) {
    const ai = options.aiService || this.getAIService();

    // 1. Prepare candidate sections
    let candidateSections = input.candidateSections || [];
    if (candidateSections.length === 0 && Array.isArray(input.sections)) {
      const filteredResult = sectionFilter.filter(input.sections);
      candidateSections = filteredResult.candidates;
    }

    // Collect all valid section IDs to guard against hallucinations
    const validSectionIdSet = new Set();
    const sectionLookup = new Map();

    candidateSections.forEach((sec) => {
      const id = sec.sectionId || sec.id;
      if (id) {
        validSectionIdSet.add(id);
        sectionLookup.set(id, sec);
      }
    });

    const isMultiSource = input.isMultiSource !== undefined
      ? input.isMultiSource
      : (candidateSections.length > 0 && new Set(candidateSections.map((s) => s.sourceId || s.bookId)).size > 1);

    const organizationStrategy = this.selectStrategy(input.contentType, isMultiSource);
    const totalSectionsCount = input.totalSections || candidateSections.length || 0;

    // TASK 3: Content-aware payload with Option A prose excerpts (~200 words)
    const contentAwareSections = candidateSections.map((sec) => {
      const id = sec.sectionId || sec.id;
      const title = sec.sectionTitle || sec.title || 'Untitled Section';
      const sourceTitle = sec.sourceTitle || sec.bookTitle || 'Source Document';
      const contentType = sec.contentType || input.contentType || 'general';
      const excerpt = this.extractContentExcerpt(sec);
      const wordCount = typeof sec.wordCount === 'number'
        ? sec.wordCount
        : (sec.content ? sec.content.split(/\s+/).filter(Boolean).length : excerpt.split(/\s+/).filter(Boolean).length);

      return {
        sectionId: id,
        sectionTitle: title,
        sourceTitle,
        contentType,
        wordCount,
        contentExcerpt: excerpt,
      };
    });

    // Construct content-aware prompt
    const prompt = this.buildPrompt({
      contentType: input.contentType,
      organizationStrategy,
      totalSections: totalSectionsCount,
      candidateSections: contentAwareSections,
      topic: input.topic,
    });

    // Call AI provider
    if (!ai || typeof ai.generateText !== 'function') {
      return {
        status: 'failed',
        reason: 'AI service unavailable for editorial planning',
      };
    }

    try {
      const aiResponse = await ai.generateText(prompt, {
        temperature: 0.2,
        title: `Editorial Plan: ${input.topic || 'Reader Outline'}`,
      });

      const rawText = (aiResponse && aiResponse.text) ? aiResponse.text.trim() : '';

      // Strict JSON parsing
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
      const jsonStr = (jsonMatch[1] || rawText).trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        return {
          status: 'failed',
          reason: `AI returned invalid JSON: ${parseErr.message}. Output was: ${rawText.slice(0, 120)}`,
        };
      }

      if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
        return {
          status: 'failed',
          reason: 'AI response missing required chapters array in JSON schema',
        };
      }

      // TASK 5: Validate output schema & verify every sourceSectionId exists in input
      const sanitizedChapters = [];
      let chapterOrder = 1;

      for (const ch of parsed.chapters) {
        if (!ch.title) continue;

        const rawSectionIds = Array.isArray(ch.sourceSectionIds) ? ch.sourceSectionIds : [];
        const validIds = [];

        for (const sid of rawSectionIds) {
          if (validSectionIdSet.has(sid)) {
            validIds.push(sid);
          } else {
            this.logger.warn(`[EditorialPlanner] Discarded invalid/invented sourceSectionId: "${sid}"`);
          }
        }

        // Discard empty chapters that have no valid sourceSectionIds
        if (validIds.length === 0) {
          this.logger.warn(`[EditorialPlanner] Discarded chapter "${ch.title}" because it contains zero valid sourceSectionIds.`);
          continue;
        }

        // TASK 4 & 5: Ensure targetWordCount is assigned, computing it from mapped sections if missing
        let targetWordCount = typeof ch.targetWordCount === 'number' && ch.targetWordCount > 0
          ? Math.round(ch.targetWordCount)
          : this.computeChapterWordBudget(validIds, sectionLookup);

        // Clamp according to specification rules
        if (targetWordCount > 450) {
          targetWordCount = 450;
        }

        sanitizedChapters.push({
          chapterId: ch.chapterId || `ch-plan-${chapterOrder}`,
          title: ch.title,
          purpose: ch.purpose || `Editorial synthesis on ${ch.title}`,
          sourceSectionIds: validIds,
          sourceSections: validIds.map((id) => {
            const sec = sectionLookup.get(id);
            return {
              sectionId: id,
              sourceTitle: sec ? (sec.sourceTitle || sec.bookTitle || 'Source') : 'Source',
              sectionTitle: sec ? (sec.sectionTitle || sec.title || id) : id,
            };
          }),
          topics: Array.isArray(ch.topics) ? ch.topics : [],
          targetWordCount,
          order: typeof ch.order === 'number' ? ch.order : chapterOrder++,
        });
      }

      // If all chapters were discarded as empty
      if (sanitizedChapters.length === 0) {
        return {
          status: 'failed',
          reason: 'All chapters in AI plan were empty or contained only invalid sourceSectionIds.',
        };
      }

      const finalStrategy = parsed.organizationStrategy || organizationStrategy;

      return {
        status: 'success',
        organizationStrategy: finalStrategy,
        chapters: sanitizedChapters,
      };
    } catch (err) {
      return {
        status: 'failed',
        reason: `Editorial planning failed: ${err.message}`,
      };
    }
  }

  /**
   * Deterministic planning fallback (when AI is not requested or for predictable testing)
   */
  planDeterministic(input = {}) {
    let candidateSections = input.candidateSections || [];
    if (candidateSections.length === 0 && Array.isArray(input.sections)) {
      const filteredResult = sectionFilter.filter(input.sections);
      candidateSections = filteredResult.candidates;
    }

    const clusters = redundancyDetector.detect(candidateSections);
    const isMultiSource = input.isMultiSource !== undefined
      ? input.isMultiSource
      : (candidateSections.length > 0 && new Set(candidateSections.map((s) => s.sourceId || s.bookId)).size > 1);

    const organizationStrategy = this.selectStrategy(input.contentType, isMultiSource);
    const totalSections = candidateSections.length;

    const sectionLookup = new Map();
    candidateSections.forEach((sec) => {
      const id = sec.sectionId || sec.id;
      if (id) sectionLookup.set(id, sec);
    });

    const chapters = [];
    let order = 1;

    // For single-source books or chronological content: slice into source units of ~1,500–2,500 words
    if (!isMultiSource || organizationStrategy === 'chronological') {
      const units = this.sliceIntoSourceUnits(candidateSections);

      for (const unit of units) {
        const sectionIds = unit.sections.map((s) => s.sectionId || s.id);
        const firstSec = unit.sections[0] || {};
        const firstTitle = firstSec.sectionTitle || firstSec.title || `Part ${order}`;
        const targetWordCount = this.computeChapterWordBudget(sectionIds, sectionLookup);

        chapters.push({
          chapterId: `ch-plan-${order}`,
          title: `Part ${order}: ${firstTitle}`,
          purpose: `Compressed representation covering ${sectionIds.length} source section(s)`,
          sourceSectionIds: sectionIds,
          sourceSections: sectionIds.map((id) => {
            const sec = sectionLookup.get(id);
            return {
              sectionId: id,
              sourceTitle: sec ? (sec.sourceTitle || sec.bookTitle || 'Source') : 'Source',
              sectionTitle: sec ? (sec.sectionTitle || sec.title || id) : id,
            };
          }),
          topics: unit.sections.map((s) => s.sectionTitle || s.title).filter(Boolean).slice(0, 3),
          targetWordCount,
          order: order++,
        });
      }
    } else {
      // For thematic or multi-source dossier: synthesize clusters
      const multiClusters = clusters.filter((c) => c.sectionIds.length > 1);
      const singleClusters = clusters.filter((c) => c.sectionIds.length === 1);

      // Create chapters for each major semantic cluster
      for (const cl of multiClusters) {
        const targetWordCount = this.computeChapterWordBudget(cl.sectionIds, sectionLookup);
        chapters.push({
          chapterId: `ch-plan-${order}`,
          title: cl.label,
          purpose: `Synthesizes evidence and viewpoints across ${cl.sectionIds.length} sources for ${cl.label}`,
          sourceSectionIds: cl.sectionIds,
          sourceSections: cl.sectionIds.map((id) => {
            const sec = sectionLookup.get(id);
            return {
              sectionId: id,
              sourceTitle: sec ? (sec.sourceTitle || sec.bookTitle || 'Source') : 'Source',
              sectionTitle: sec ? (sec.sectionTitle || sec.title || id) : id,
            };
          }),
          topics: cl.keywords || [],
          targetWordCount,
          order: order++,
        });
      }

      // If standalone sections remain, bundle them into cohesive topic chapters
      if (singleClusters.length > 0) {
        const remainingSectionIds = singleClusters.flatMap((c) => c.sectionIds);
        const bundleSize = Math.max(1, Math.ceil(remainingSectionIds.length / 3));

        for (let i = 0; i < remainingSectionIds.length; i += bundleSize) {
          const sliceIds = remainingSectionIds.slice(i, i + bundleSize);
          const sampleTitles = sliceIds.map((id) => {
            const sec = sectionLookup.get(id);
            return sec ? (sec.sectionTitle || sec.title) : id;
          });
          const targetWordCount = this.computeChapterWordBudget(sliceIds, sectionLookup);

          chapters.push({
            chapterId: `ch-plan-${order}`,
            title: sampleTitles[0] ? `Specialized Insights: ${sampleTitles[0]}` : `Specialized Perspectives`,
            purpose: `Synthesizes specialized topics across original source investigations`,
            sourceSectionIds: sliceIds,
            sourceSections: sliceIds.map((id) => {
              const sec = sectionLookup.get(id);
              return {
                sectionId: id,
                sourceTitle: sec ? (sec.sourceTitle || sec.bookTitle || 'Source') : 'Source',
                sectionTitle: sec ? (sec.sectionTitle || sec.title || id) : id,
              };
            }),
            topics: sampleTitles.slice(0, 3),
            targetWordCount,
            order: order++,
          });
        }
      }
    }

    return {
      status: 'success',
      organizationStrategy,
      chapters,
    };
  }

  /**
   * Build content-aware prompt for the Light LLM
   */
  buildPrompt({
    contentType,
    organizationStrategy,
    totalSections,
    candidateSections = [],
    topic,
  }) {
    return `You are an editorial planner, not a writer.
Your task is to transform ${totalSections} source sections into a coherent, reader-oriented chapter plan for human reading.
Chapter count should naturally emerge from the thematic and conceptual structure of the content.

RULES:
1. You are an editorial planner, not a writer. Do NOT write chapter text.
2. Carefully read the supplied content excerpts to determine how ideas, themes, and evidence connect across sections.
3. Organize for human reading comprehension: group related material across source sections and eliminate redundancy.
4. Each planned chapter must target approximately 250–360 words based on the depth of mapped material (or fewer, down to 180 words, if the material is thin).
4. Each planned chapter must be a compressed representation of ~1,500-2,500 source words, producing 250-360 output words. Chapters are compression units, not thematic containers.
5. Every sourceSectionId in your chapters MUST come directly from the supplied sectionIds. NEVER invent or hallucinate section IDs.
6. Every chapter must have at least one valid sourceSectionId. Do not produce empty chapters.
7. Return strict JSON matching the schema below. No conversational prose or markdown surrounding text.

CONTENT TYPE: ${contentType || 'research'}
TOPIC / COLLECTION TITLE: ${topic || 'Multi-Source Synthesis'}
RECOMMENDED ORGANIZATION STRATEGY: ${organizationStrategy}

SUPPLIED CANDIDATE SOURCE SECTIONS WITH CONTENT EXCERPTS:
${JSON.stringify(candidateSections, null, 2)}

SCHEMA:
{
  "organizationStrategy": "${organizationStrategy}",
  "chapters": [
    {
      "order": 1,
      "title": "Clear, informative chapter title",
      "purpose": "What this chapter synthesizes for the reader",
      "topics": ["topic 1", "topic 2"],
      "sourceSectionIds": ["exact-section-id-from-input-1", "exact-section-id-from-input-2"],
      "targetWordCount": 300
    }
  ]
}

Return JSON only:`;
  }
}

module.exports = new EditorialPlanner();
