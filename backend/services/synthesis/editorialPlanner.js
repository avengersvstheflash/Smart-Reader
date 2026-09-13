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
   * Calculate targetWordCount for a planned chapter based on mapped source sections
   * Task 4 Rules:
   * - Target ~1,500–3,000 words per chapter
   * - Sum of wordCounts of mapped source sections divided by compression ratio (0.4)
   * - Clamp to [1500, 3000]. If material is thin, allow shorter down to minimum 400 words.
   * - Do NOT pad to reach target.
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
        } else {
          rawSourceWordCount += 250; // reasonable baseline estimate per section
        }
      }
    }

    const compressionRatio = 0.4;
    const estimatedWords = Math.round(rawSourceWordCount * compressionRatio);

    if (estimatedWords < 1500) {
      // Thin material: allow shorter, down to minimum 400 words
      return Math.max(400, estimatedWords);
    }
    // Substantial material: clamp to [1500, 3000]
    return Math.min(3000, estimatedWords);
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
        if (targetWordCount > 3000) {
          targetWordCount = 3000;
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

    // For narrative content: preserve chronology across sections
    if (organizationStrategy === 'chronological') {
      const targetCount = totalSections > 20 ? 8 : Math.max(2, Math.min(6, totalSections));
      const chunkSize = Math.max(1, Math.ceil(totalSections / targetCount));

      for (let i = 0; i < totalSections; i += chunkSize) {
        const slice = candidateSections.slice(i, i + chunkSize);
        const sectionIds = slice.map((s) => s.sectionId || s.id);
        const firstTitle = slice[0].sectionTitle || slice[0].title || `Act ${order}`;
        const targetWordCount = this.computeChapterWordBudget(sectionIds, sectionLookup);

        chapters.push({
          chapterId: `ch-plan-${order}`,
          title: `Part ${order}: ${firstTitle}`,
          purpose: `Chronological progression covering sections ${i + 1} through ${Math.min(totalSections, i + chunkSize)}`,
          sourceSectionIds: sectionIds,
          sourceSections: sectionIds.map((id) => {
            const sec = sectionLookup.get(id);
            return {
              sectionId: id,
              sourceTitle: sec ? (sec.sourceTitle || sec.bookTitle || 'Source') : 'Source',
              sectionTitle: sec ? (sec.sectionTitle || sec.title || id) : id,
            };
          }),
          topics: slice.map((s) => s.sectionTitle || s.title).slice(0, 3),
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
4. Each planned chapter must target approximately 1,500–3,000 words based on the depth of mapped material (or fewer, down to 400 words, if the material is thin).
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
      "targetWordCount": 2000
    }
  ]
}

Return JSON only:`;
  }
}

module.exports = new EditorialPlanner();
