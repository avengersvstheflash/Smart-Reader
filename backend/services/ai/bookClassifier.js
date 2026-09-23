const aiService = require('./aiService');
const bookRepository = require('../../repositories/bookRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const jobRepository = require('../../repositories/jobRepository');
const sectionFilter = require('../synthesis/sectionFilter');
const { getDatabase } = require('../../db/database');

const VALID_CONTENT_TYPES = [
  'textbook',
  'novel',
  'essay',
  'paper',
  'reference',
  'memo',
  'article',
  'other',
];

const VALID_READING_LEVELS = [
  'introductory',
  'intermediate',
  'advanced',
  'research',
];

class BookClassifier {
  /**
   * Classify book domain metadata, contentType, tags, reading level, target audience,
   * prerequisites, and tools covered using a single focused LLM call with deterministic fallback.
   *
   * @param {string} bookId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async classifyBook(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const jobId = `job-class-${bookId}-${Date.now()}`;
    jobRepository.create({
      id: jobId,
      book_id: bookId,
      type: 'CLASSIFICATION',
      status: 'PROCESSING',
      progress: 10,
    });

    try {
      // 1. Gather context from chapters and semantic chunks
      const chapters = chapterRepository.getByBookId(bookId) || [];
      const allChunks = semanticChunkRepository.getByBookId(bookId) || [];

      // Extract TOC
      let tocText = '';
      if (allChunks.length > 0) {
        const sectionsForFilter = allChunks.map((c) => ({
          id: c.id,
          sectionTitle: c.sectionHeading || c.sourceReference,
          wordCount: c.tokenCount || (c.textContent || '').split(/\s+/).length,
        }));
        const { filtered } = sectionFilter.filter(sectionsForFilter);
        const tocIds = new Set(
          filtered
            .filter(
              (s) =>
                s.reason === 'navigation' &&
                /table of contents|contents|toc/i.test(s.sectionTitle)
            )
            .map((s) => s.id)
        );
        const tocChunks = allChunks.filter((c) => tocIds.has(c.id));
        if (tocChunks.length > 0) {
          tocText = tocChunks.map((c) => c.textContent).join('\n\n').trim();
        }
      }

      if (!tocText && chapters.length > 0) {
        tocText = chapters
          .map((ch, idx) => `${idx + 1}. ${ch.title}`)
          .join('\n');
      }
      if (!tocText) tocText = '(No table of contents available)';

      // Extract opening paragraph of chapter 1 and last chapter
      const extractFirstPara = (text) => {
        if (!text || !text.trim()) return '(None provided)';
        const paras = text
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        return paras[0] || text.trim();
      };

      let ch1FirstPara = '(None provided)';
      let lastChFirstPara = '(None provided)';

      if (chapters.length > 0) {
        ch1FirstPara = extractFirstPara(chapters[0].content);
        if (chapters.length > 1) {
          lastChFirstPara = extractFirstPara(
            chapters[chapters.length - 1].content
          );
        } else {
          lastChFirstPara = ch1FirstPara;
        }
      } else if (allChunks.length > 0) {
        ch1FirstPara = extractFirstPara(allChunks[0].textContent);
        lastChFirstPara = extractFirstPara(
          allChunks[allChunks.length - 1].textContent
        );
      }

      // 2. Build classification prompt
      const prompt = `You are classifying a book for a personal library system. Given title, author, TOC, and opening paragraphs, produce a structured classification. Output JSON only, no prose.

{
  "contentType": one of
    "textbook" | "novel" | "essay" | "paper" |
    "reference" | "memo" | "article" | "other",
  "tags": array of 3-8 lowercase hyphenated topic tags,
  "readingLevel": one of
    "introductory" | "intermediate" | "advanced" |
    "research",
  "targetAudience": one short sentence,
  "prerequisites": array of 0-3 short strings,
  "toolsCovered": array of 0-5 short strings
}

Rules:
- Output valid JSON only. No markdown fences. No explanation.
- If a field cannot be determined from inputs, use "" or []. Do not guess.
- Do not invent details not present in the inputs.

INPUTS:
Title: ${book.title}
Author: ${book.author || 'Unknown Author'}
TOC:
${tocText}

CHAPTER 1 OPENING:
${ch1FirstPara}

LAST CHAPTER OPENING:
${lastChFirstPara}

OUTPUT:`;

      jobRepository.update(jobId, { progress: 40 });

      let classificationResult = null;
      let fellBack = false;

      if (!options.fast) {
        // Attempt LLM generation up to 2 times
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const provider = aiService.getActiveProvider();
            const health = await provider.checkHealth();
            if (!health || !health.available) break;

            jobRepository.update(jobId, { progress: 55 });

            const timeoutMs = options.timeout || 20000;
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AI classification timeout')), timeoutMs)
            );

            const response = await Promise.race([
              provider.summarize({
                text: prompt,
                title: book.title,
                options: {
                  isPrompt: true,
                  task: 'classification',
                  maxTokens: 500,
                  reasoning: { enabled: false },
                  ...options,
                },
              }),
              timeoutPromise,
            ]);

            jobRepository.update(jobId, { progress: 70 });

            if (response && response.summary) {
              const cleaned = response.summary
                .replace(/```(?:json)?/gi, '')
                .replace(/```/g, '')
                .trim();
              const parsed = JSON.parse(cleaned);

              if (parsed && typeof parsed === 'object') {
                classificationResult = this.normalizeClassification(parsed);
                break;
              }
            }
          } catch (err) {
            console.warn(
              `[BookClassifier] Attempt ${attempt} failed for book ${bookId}:`,
              err.message
            );
          }
        }
      }

      // 3. Fallback if LLM classification failed
      if (!classificationResult) {
        fellBack = true;
        classificationResult = this.heuristicFallback(book, chapters);
        jobRepository.update(jobId, { progress: 70 });
      }

      jobRepository.update(jobId, { progress: 85 });

      // 4. Update books table (content_type + metadata_json.classification)
      const db = getDatabase();
      const currentMeta =
        typeof book.metadata_json === 'string'
          ? JSON.parse(book.metadata_json || '{}')
          : book.metadata_json || {};

      const classificationData = {
        contentType: classificationResult.contentType,
        tags: classificationResult.tags,
        readingLevel: classificationResult.readingLevel,
        targetAudience: classificationResult.targetAudience,
        prerequisites: classificationResult.prerequisites,
        toolsCovered: classificationResult.toolsCovered,
        fell_back: fellBack,
        classifiedAt: new Date().toISOString(),
      };

      const updatedMeta = {
        ...currentMeta,
        classification: classificationData,
      };

      // Update books.content_type with the classified contentType UNLESS
      // fell_back: true AND current value is not 'novel' (don't downgrade good data with a heuristic guess)
      let targetContentType = book.content_type;
      if (!fellBack || book.content_type === 'novel') {
        targetContentType = classificationResult.contentType;
      }

      db.prepare(
        'UPDATE books SET content_type = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
      ).run(
        targetContentType,
        JSON.stringify(updatedMeta),
        new Date().toISOString(),
        book.id
      );

      jobRepository.complete(jobId);

      return classificationData;
    } catch (err) {
      console.error(`[BookClassifier] Error classifying book ${bookId}:`, err);
      jobRepository.fail(jobId, err.message);
      throw err;
    }
  }

  /**
   * Normalize and validate structured classification JSON from LLM
   */
  normalizeClassification(raw) {
    let contentType = String(raw.contentType || '').toLowerCase().trim();
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      contentType = 'other';
    }

    let readingLevel = String(raw.readingLevel || '').toLowerCase().trim();
    if (!VALID_READING_LEVELS.includes(readingLevel)) {
      readingLevel = 'intermediate';
    }

    const tags = Array.isArray(raw.tags)
      ? raw.tags
          .map((t) =>
            String(t)
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
          )
          .filter(Boolean)
      : [];

    const targetAudience =
      typeof raw.targetAudience === 'string' ? raw.targetAudience.trim() : '';

    const prerequisites = Array.isArray(raw.prerequisites)
      ? raw.prerequisites.map((p) => String(p).trim()).filter(Boolean)
      : [];

    const toolsCovered = Array.isArray(raw.toolsCovered)
      ? raw.toolsCovered.map((t) => String(t).trim()).filter(Boolean)
      : [];

    return {
      contentType,
      tags,
      readingLevel,
      targetAudience,
      prerequisites,
      toolsCovered,
      fell_back: false,
    };
  }

  /**
   * Deterministic heuristic fallback when LLM is unavailable or unparseable
   */
  heuristicFallback(book, chapters = []) {
    const chapterCount = chapters.length;
    const totalWords = chapters.reduce((acc, c) => acc + (c.word_count || 0), 0);
    const avgChapterWords = totalWords / Math.max(1, chapterCount);

    let totalParas = 0;
    let totalParaWords = 0;
    for (const ch of chapters.slice(0, 3)) {
      const paras = (ch.content || '')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      totalParas += paras.length;
      totalParaWords += paras.reduce(
        (acc, p) => acc + p.split(/\s+/).length,
        0
      );
    }
    const avgParagraphWords =
      totalParas > 0 ? totalParaWords / totalParas : 100;

    let contentType = 'other';
    if (chapterCount > 5 && avgChapterWords > 3000) {
      contentType = 'textbook';
    } else if (chapterCount < 3 && avgParagraphWords < 200) {
      contentType = 'article';
    }

    return {
      contentType,
      tags: [],
      readingLevel: 'intermediate',
      targetAudience: '',
      prerequisites: [],
      toolsCovered: [],
      fell_back: true,
    };
  }
}

module.exports = new BookClassifier();

