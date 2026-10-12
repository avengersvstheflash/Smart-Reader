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

const DEFAULT_MAX_SECTION_LLM_CALLS = 20;
const docCallTracker = new Map();
const trippedLoggedKeys = new Set();

function getEffectiveMaxLlmCalls() {
  const envVal = parseInt(process.env.MAX_SECTION_LLM_CALLS, 10);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : DEFAULT_MAX_SECTION_LLM_CALLS;
}

function resetCircuitBreaker(docKey) {
  if (docKey) {
    docCallTracker.delete(docKey);
    trippedLoggedKeys.delete(docKey);
  } else {
    docCallTracker.clear();
    trippedLoggedKeys.clear();
  }
}

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
  if (hasDotLeadersWithPages || tocLineCount >= 2 || (isExplicitTocHeading && (headingLevel > 0 || tocLineCount >= 1 || cleanHeading.length < 30))) {
    return { section: 'TOC', confidence: 0.9 };
  }

  // 2. COPYRIGHT: Explicit copyright notice, ISBN, rights declaration near start or in copyright stream
  const isExplicitCopyrightHeading = /^(?:copyright|copyright notice|rights and permissions)$/i.test(cleanHeading);
  const copyrightPattern = /\b(?:all rights reserved|isbn(?:-1[03])?:?|(?:copyright|©|\(c\))\s*(?:[12]\d{3}|by\b|all\b)|printed in (?:the )?[a-z]+)\b/i;
  const isCopyrightBlock = isExplicitCopyrightHeading || copyrightPattern.test(text) ||
    ((!context.priorSection || context.priorSection === 'COPYRIGHT' || context.isFirstBlock) && /\b(?:copyright|©|\(c\))\b/i.test(text));
  if (isCopyrightBlock) {
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

  // 6. Explicit body chapter/section structural headings (e.g. Chapter 1, Section 2, Part 1)
  if (headingLevel > 0 && /^(?:chapter|part|section|scene|act|canto|volume|book|\d+[\.\:\s])/i.test(cleanHeading)) {
    return { section: 'BODY', confidence: 0.85 };
  }

  // 7. Dynamic stream continuation: intelligent section tracking based on active document state
  const FRONT_MATTER_SECTIONS = new Set(['PREFACE', 'FOREWORD', 'INTRODUCTION', 'ACKNOWLEDGMENTS', 'DEDICATION']);
  const BACK_MATTER_SECTIONS = new Set(['APPENDIX', 'GLOSSARY', 'BIBLIOGRAPHY', 'INDEX', 'COLOPHON']);
  const prior = context && context.priorSection;

  if (prior) {
    if (prior === 'BODY') {
      if (headingLevel === 0) {
        // Body continuation paragraph — dynamically scales confidence with prose length (no 30-39 gap)
        const dynamicConfidence = wordCount >= 30 ? 0.85 : (wordCount >= 10 ? 0.8 : 0.7);
        return { section: 'BODY', confidence: dynamicConfidence };
      }
      if (block && (block.type === 'code' || block.type === 'table')) {
        return { section: 'BODY', confidence: 0.9 };
      }
      // Non-matter headings or subheadings inside an active BODY stream (e.g. markdown headers, chat speakers)
      return { section: 'BODY', confidence: 0.85 };
    }

    if (FRONT_MATTER_SECTIONS.has(prior)) {
      if (headingLevel === 0) {
        // Front-matter continuation paragraph
        const dynamicConfidence = wordCount >= 30 ? 0.85 : (wordCount >= 10 ? 0.8 : 0.75);
        return { section: prior, confidence: dynamicConfidence };
      }
      if (block && (block.type === 'code' || block.type === 'table')) {
        return { section: prior, confidence: 0.85 };
      }
      if (headingLevel >= 2) {
        // Subheading inside front matter (e.g. ## Note to Instructors inside Preface)
        return { section: prior, confidence: 0.8 };
      }
      if (headingLevel === 1) {
        // Top-level major heading after front matter transitions to BODY (e.g. # The Journey)
        return { section: 'BODY', confidence: 0.8 };
      }
    }

    if (BACK_MATTER_SECTIONS.has(prior)) {
      if (headingLevel === 0) {
        // Back-matter continuation paragraph
        const dynamicConfidence = wordCount >= 30 ? 0.85 : (wordCount >= 10 ? 0.8 : 0.75);
        return { section: prior, confidence: dynamicConfidence };
      }
      if (block && (block.type === 'code' || block.type === 'table')) {
        return { section: prior, confidence: 0.9 };
      }
      if (headingLevel >= 2) {
        // Subheading inside back matter (e.g. ### Proof of Lemma A in Appendix)
        return { section: prior, confidence: 0.85 };
      }
    }

    if (prior === 'TOC') {
      if (headingLevel === 0 && (tocLineCount >= 1 || hasDotLeadersWithPages || wordCount < 40)) {
        return { section: 'TOC', confidence: 0.85 };
      }
    }

    if (prior === 'COPYRIGHT') {
      if (headingLevel === 0 && wordCount < 60) {
        return { section: 'COPYRIGHT', confidence: 0.8 };
      }
    }
  }

  // 8. Explicit structural content blocks without active front/back stream
  if (block && (block.type === 'code' || block.type === 'table')) {
    return { section: 'BODY', confidence: 0.9 };
  }

  // 9. Substantial prose paragraph without prior section (closes the 30-39 word gap for standalone prose)
  if (wordCount >= 30 && headingLevel === 0) {
    return { section: 'BODY', confidence: wordCount >= 40 ? 0.85 : 0.8 };
  }

  // 10. Default: UNKNOWN (0.3) -> triggers LLM if not constrained by circuit breaker / skipLlm
  return { section: 'UNKNOWN', confidence: 0.3 };
}

/**
 * Classifies a single document block into a section type.
 * Runs fast heuristics first; if confidence < 0.6 or UNKNOWN, queries LLM.
 *
 * @param {object} block - { text, wordCount, headingLevel, position }
 * @param {object} context - { bookTitle, bookId, isFirstBlock, isLastBlock, priorSection, aiService, circuitBreaker, maxLlmCalls, skipLlm }
 * @returns {Promise<{ section: string, confidence: number, method: 'heuristic' | 'llm' | 'fallback', circuitBreakerTriggered?: boolean }>}
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

  // Fast path / skip LLM check: caller requested no LLM (e.g. text/md fast path)
  if (context.skipLlm || context.allowLlm === false) {
    const fallbackSection = (context.priorSection && context.priorSection !== 'UNKNOWN')
      ? context.priorSection
      : 'BODY';
    return {
      section: fallbackSection,
      confidence: 0.6,
      method: 'fallback',
    };
  }

  // 2. Safety Circuit Breaker: cap max LLM calls per document to avoid runaway API stalls
  const maxCalls = typeof context.maxLlmCalls === 'number'
    ? context.maxLlmCalls
    : (context.circuitBreaker?.maxCalls ?? getEffectiveMaxLlmCalls());

  const docKey = context.documentId || context.bookId || context.bookTitle;
  const circuitBreaker = context.circuitBreaker;
  const effectiveDocKey = docKey || '__anonymous_session__';

  let currentCalls = 0;
  if (circuitBreaker && typeof circuitBreaker.calls === 'number') {
    currentCalls = circuitBreaker.calls;
  } else if (docCallTracker.has(effectiveDocKey)) {
    currentCalls = docCallTracker.get(effectiveDocKey);
  }

  if (currentCalls >= maxCalls) {
    const logKey = docKey || 'unnamed_document';
    if (!trippedLoggedKeys.has(logKey)) {
      console.warn(`[SectionClassifier] Circuit breaker tripped for "${logKey}": reached max LLM calls (${maxCalls}). Defaulting remaining ambiguous blocks to BODY.`);
      trippedLoggedKeys.add(logKey);
    }
    return {
      section: 'BODY',
      confidence: 0.5,
      method: 'fallback',
      circuitBreakerTriggered: true,
    };
  }

  // Increment call tracker
  if (circuitBreaker) {
    circuitBreaker.calls = currentCalls + 1;
  } else {
    docCallTracker.set(effectiveDocKey, currentCalls + 1);
    if (docCallTracker.size > 500) {
      const oldestKey = docCallTracker.keys().next().value;
      docCallTracker.delete(oldestKey);
      trippedLoggedKeys.delete(oldestKey);
    }
  }

  // 3. Ambiguous block -> Call resolved LLM provider
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
  resetCircuitBreaker,
  DEFAULT_MAX_SECTION_LLM_CALLS,
  SECTION_TYPES,
};
module.exports.classifySection = classifySection;
module.exports.classifyHeuristically = classifyHeuristically;
module.exports.buildSectionMapFast = buildSectionMapFast;
module.exports.resetCircuitBreaker = resetCircuitBreaker;
module.exports.DEFAULT_MAX_SECTION_LLM_CALLS = DEFAULT_MAX_SECTION_LLM_CALLS;
module.exports.default = classifySection;


