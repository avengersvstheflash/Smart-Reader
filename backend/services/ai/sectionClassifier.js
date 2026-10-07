/**
 * backend/services/ai/sectionClassifier.js
 *
 * F32 — Section Classifier for Ingestion Pipeline
 * Two-layer classifier (heuristic + LLM) that classifies document blocks into
 * structural section types (BODY, TOC, PREFACE, FOREWORD, INTRODUCTION,
 * ACKNOWLEDGMENTS, DEDICATION, COPYRIGHT, INDEX, APPENDIX, GLOSSARY,
 * BIBLIOGRAPHY, COLOPHON, UNKNOWN).
 *
 * Provider routing is a trust boundary: uses the existing aiService / provider
 * client so local-only users route to their local provider (e.g. Ollama)
 * without making cloud calls.
 */

'use strict';

const aiService = require('./aiService');
const { callOpenRouterWithBackoff } = require('./openrouterProvider');
const { detectStructure } = require('./structureDetector');

const SECTION_TYPES = [
  'BODY',
  'TOC',
  'PREFACE',
  'FOREWORD',
  'INTRODUCTION',
  'ACKNOWLEDGMENTS',
  'DEDICATION',
  'COPYRIGHT',
  'INDEX',
  'APPENDIX',
  'GLOSSARY',
  'BIBLIOGRAPHY',
  'COLOPHON',
  'UNKNOWN',
];

/**
 * Heuristic classification rules (fast, deterministic, zero-cost)
 * @param {object} block
 * @param {object} context
 * @returns {{ section: string, confidence: number }}
 */
function classifyHeuristically(block, context = {}) {
  const text = (block && block.text) ? String(block.text).trim() : '';
  if (!text) {
    return { section: 'BODY', confidence: 0.5 };
  }

  const wordCount = typeof block.wordCount === 'number'
    ? block.wordCount
    : text.split(/\s+/).filter(Boolean).length;
  const headingLevel = typeof block.headingLevel === 'number'
    ? block.headingLevel
    : (block.type === 'heading' ? (block.level || 1) : 0);
  const firstLine = text.split('\n')[0].trim();
  const cleanHeading = firstLine.replace(/^#+\s*/, '').trim();

  // 1. TOC: Dot leaders + page numbers + high density OR explicit TOC heading
  const hasDotLeadersWithPages = /(?:\.{2,}|…+)\s*(?:\d+|[ivxlcdm]+)\b/i.test(text);
  const tocLineCount = (text.match(/(?:\.{2,}|\s{3,}|\t+)(?:\d+|[ivxlcdm]+)\s*$/gim) || []).length;
  const isExplicitTocHeading = /^(?:table of contents|contents|brief contents|toc)$/i.test(cleanHeading);
  if (hasDotLeadersWithPages || tocLineCount >= 2 || (isExplicitTocHeading && tocLineCount >= 1)) {
    return { section: 'TOC', confidence: 0.9 };
  }

  // 2. COPYRIGHT: "Copyright", "All rights reserved", "ISBN", year pattern near start
  const copyrightRegex = /\b(?:copyright|all rights reserved|isbn(?:-1[03])?:?|\(c\)|©)\b/i;
  if (copyrightRegex.test(text)) {
    return { section: 'COPYRIGHT', confidence: 0.85 };
  }

  // 3. INDEX: "Index" heading + alphabetical entries or index line pattern
  const isIndexHeading = /^(?:index|subject index|author index)$/i.test(cleanHeading) ||
    (headingLevel > 0 && /^index\b/i.test(cleanHeading));
  const hasIndexEntries = /\b[A-Za-z\s]+,\s*\d+(?:\s*,\s*\d+)*\b/.test(text) ||
    /^[A-Z]\b[\s\S]*?[a-zA-Z]+,\s*\d+/m.test(text);
  if (isIndexHeading && (hasIndexEntries || headingLevel > 0)) {
    return { section: 'INDEX', confidence: 0.9 };
  }

  // 4. PREFACE / FOREWORD as heading
  if (/^preface\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'PREFACE', confidence: 0.9 };
  }
  if (/^foreword\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'FOREWORD', confidence: 0.9 };
  }

  // 5. Other canonical book matter headings
  if (/^acknowledg(?:e)?ments?\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'ACKNOWLEDGMENTS', confidence: 0.9 };
  }
  if (/^dedication\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'DEDICATION', confidence: 0.9 };
  }
  if (/^introduction\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'INTRODUCTION', confidence: 0.9 };
  }
  if (/^appendix(?:\s+[a-z0-9]+)?\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'APPENDIX', confidence: 0.9 };
  }
  if (/^glossary\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'GLOSSARY', confidence: 0.9 };
  }
  if (/^(?:bibliography|references|works cited)\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'BIBLIOGRAPHY', confidence: 0.9 };
  }
  if (/^colophon\b/i.test(cleanHeading) && (headingLevel > 0 || cleanHeading.length < 40)) {
    return { section: 'COLOPHON', confidence: 0.9 };
  }

  // 6. If prior section is BODY and block has < 30 words -> BODY (0.7)
  if (context && context.priorSection === 'BODY' && wordCount < 30) {
    return { section: 'BODY', confidence: 0.7 };
  }

  // 7. Long body paragraph (substantial prose without front/back markers) -> BODY (0.8)
  if (wordCount >= 40 && headingLevel === 0) {
    return { section: 'BODY', confidence: 0.8 };
  }

  // 8. Default: UNKNOWN (0.3) -> triggers LLM
  return { section: 'UNKNOWN', confidence: 0.3 };
}

/**
 * Classifies a single document block into a section type.
 * Runs fast heuristics first; if confidence < 0.6 or UNKNOWN, queries LLM.
 *
 * @param {object} block - { text, wordCount, headingLevel, position }
 * @param {object} context - { bookTitle, bookId, isFirstBlock, isLastBlock, priorSection, aiService }
 * @returns {Promise<{ section: string, confidence: number, method: 'heuristic' | 'llm' | 'fallback' }>}
 */
async function classifySection(block, context = {}) {
  const text = (block && block.text) ? String(block.text).trim() : '';

  // Edge case: empty block handled gracefully without crashing
  if (!text) {
    return { section: 'BODY', confidence: 0.5, method: 'heuristic' };
  }

  // 1. Run heuristic classifier
  const heuristic = classifyHeuristically(block, context);

  // If confident (>= 0.6 and not UNKNOWN), return immediately
  if (heuristic.section !== 'UNKNOWN' && heuristic.confidence >= 0.6) {
    return {
      section: heuristic.section,
      confidence: heuristic.confidence,
      method: 'heuristic',
    };
  }

  // 2. Ambiguous block -> Call resolved LLM provider
  const providerClient = (context && context.aiService) || aiService;

  const prompt = `Classify the following book document block into exactly one section type from this list:
${SECTION_TYPES.join(', ')}

Return a strict JSON object with fields "section" and "confidence" (number between 0.0 and 1.0).
Do not include markdown prose outside the JSON.

Text:
"""
${text.slice(0, 1500)}
"""`;

  try {
    const response = await callOpenRouterWithBackoff(() =>
      providerClient.generateText(prompt, {
        maxTokens: 60,
        reasoning: { enabled: false },
        temperature: 0.1,
      })
    );

    const rawResponseText = response?.text || '';
    const cleaned = rawResponseText
      .replace(/```(?:json)?/g, '')
      .replace(/```/g, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      const candidateSection = String(parsed.section || '').toUpperCase().trim();

      if (SECTION_TYPES.includes(candidateSection)) {
        const conf = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
          ? parsed.confidence
          : 0.8;

        return {
          section: candidateSection,
          confidence: conf,
          method: 'llm',
        };
      }
    }

    // JSON could not be parsed into valid SectionType -> graceful fallback
    return { section: 'BODY', confidence: 0.4, method: 'fallback' };
  } catch (_err) {
    // Graceful: treat as body rather than dropping content
    return { section: 'BODY', confidence: 0.4, method: 'fallback' };
  }
}

/**
 * Fast multi-layer structure detector with optional LLM consolidation.
 * Layer 0: PyMuPDF doc.get_toc() -> embedded bookmarks (~5ms)
 * Layer 1: font-size + numbering heuristics in Python (~50ms)
 * Layer 2: LLM consolidation of heading candidates (DISABLED by default, opt-in only)
 *
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 * @param {boolean} [options.useLlmConsolidation]
 * @param {object} [options.aiService]
 * @param {string} [options.baseUrl]
 * @returns {Promise<{
 *   frontMatterPageRange: [number, number] | null,
 *   backMatterPageRange: [number, number] | null,
 *   hasEmbeddedToc: boolean,
 *   toc: Array<{level: number, title: string, page: number}>,
 *   headingCandidates: Array<{page: number, text: string, fontSize: number, isHeading: boolean}>,
 *   method: string,
 *   llmConsolidated: boolean,
 *   warnings: string[],
 *   estimatedChapterCount?: number,
 * }>}
 */
async function buildSectionMapFast(pdfBuffer, options = {}) {
  const useLlmConsolidation = typeof options.useLlmConsolidation === 'boolean'
    ? options.useLlmConsolidation
    : (process.env.ENABLE_SECTION_LLM_CONSOLIDATION === 'true');

  const detected = await detectStructure(pdfBuffer, options);

  if (!detected) {
    return {
      frontMatterPageRange: null,
      backMatterPageRange: null,
      hasEmbeddedToc: false,
      toc: [],
      headingCandidates: [],
      method: 'none',
      llmConsolidated: false,
      warnings: ['sidecar_down'],
    };
  }

  const {
    frontMatterPageRange,
    backMatterPageRange,
    hasEmbeddedToc,
    toc,
    headingCandidates,
    method,
    warnings,
    estimatedChapterCount,
  } = detected;

  if (useLlmConsolidation && !hasEmbeddedToc && headingCandidates && headingCandidates.length > 5) {
    const compactCandidates = headingCandidates.slice(0, 150).map((c) => ({
      page: c.page,
      text: c.text,
      fontSize: c.fontSize,
    }));

    const providerClient = (options && options.aiService) || aiService;
    const prompt = `Consolidate these candidates into a chapter tree. Exclude TOC/preface/index/foreword entries. Return JSON.

Heading candidates:
${JSON.stringify(compactCandidates, null, 2)}`;

    try {
      const response = await callOpenRouterWithBackoff(() =>
        providerClient.generateText(prompt, {
          maxTokens: 500,
          reasoning: { enabled: false },
          temperature: 0.1,
        })
      );

      let consolidatedToc = toc;
      try {
        const raw = (response?.text || '').replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
        const match = raw.match(/\[[\s\S]*\]/) || raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            consolidatedToc = parsed.map((item) => ({
              level: item.level || 1,
              title: String(item.title || item.name || '').trim(),
              page: Number(item.page || 1),
            }));
          }
        }
      } catch (_) {
        // Fall back to original toc if parsing fails
      }

      return {
        frontMatterPageRange,
        backMatterPageRange,
        hasEmbeddedToc,
        toc: consolidatedToc,
        headingCandidates,
        method,
        llmConsolidated: true,
        warnings,
        estimatedChapterCount: consolidatedToc.length > 0 ? consolidatedToc.length : estimatedChapterCount,
      };
    } catch (_err) {
      return {
        frontMatterPageRange,
        backMatterPageRange,
        hasEmbeddedToc,
        toc,
        headingCandidates,
        method,
        llmConsolidated: false,
        warnings: [...warnings, 'llm_consolidation_failed'],
        estimatedChapterCount,
      };
    }
  }

  return {
    frontMatterPageRange,
    backMatterPageRange,
    hasEmbeddedToc,
    toc,
    headingCandidates,
    method,
    llmConsolidated: false,
    warnings,
    estimatedChapterCount,
  };
}

module.exports = {
  classifySection,
  classifyHeuristically,
  buildSectionMapFast,
  SECTION_TYPES,
};
module.exports.classifySection = classifySection;
module.exports.buildSectionMapFast = buildSectionMapFast;
module.exports.default = classifySection;


