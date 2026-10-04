/**
 * backend/services/ingestion/chatLogDetector.js
 *
 * Pre-parsing classifier to detect chat-log formatted documents
 * (e.g. ChatGPT / Gemini exports, study note transcripts).
 *
 * Prevents standard book parser from mistaking repeated conversational
 * markers ("User:", "Model:", "Check your answer") for chapter headings.
 *
 * Pure function, zero side-effects, deterministic.
 */

'use strict';

/**
 * Classifies document text blocks as 'book' or 'chat_log'.
 *
 * @param {Array<string|{text: string}>|string} blocks - Text blocks from extracted document
 * @returns {{
 *   parseMode: 'book' | 'chat_log',
 *   confidence: number,
 *   signals: {
 *     userMarkerDensity: number,
 *     modelMarkerDensity: number,
 *     codeFenceDensity: number,
 *     repeatedLineDensity: number,
 *     tocAbsenceBonus: number,
 *     chapterHeadingAbsenceBonus: number,
 *     matchedLines: number,
 *     totalLines: number
 *   }
 * }}
 */
function detectChatLog(blocks) {
  const emptySignals = {
    userMarkerDensity: 0,
    modelMarkerDensity: 0,
    codeFenceDensity: 0,
    repeatedLineDensity: 0,
    tocAbsenceBonus: 0,
    chapterHeadingAbsenceBonus: 0,
    matchedLines: 0,
    totalLines: 0,
  };

  if (!blocks) {
    return {
      parseMode: 'book',
      confidence: 0,
      signals: emptySignals,
    };
  }

  const rawBlocks = Array.isArray(blocks) ? blocks : [blocks];
  const lines = [];

  for (const el of rawBlocks) {
    if (el == null) continue;
    const text = typeof el === 'object' && el.text != null ? String(el.text) : String(el);
    if (!text.trim()) continue;

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const splitLines = normalized.split('\n');
    for (const rawLine of splitLines) {
      const trimmed = rawLine.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
    }
  }

  const totalLines = lines.length;
  if (totalLines === 0) {
    return {
      parseMode: 'book',
      confidence: 0,
      signals: emptySignals,
    };
  }

  const userRegex = /^(user|prompt):/i;
  const modelRegex = /^(model|assistant|gemini|chatgpt|ai):/i;
  const codeFenceRegex = /^```/;
  const tocRegex = /^(contents|table of contents)$/i;
  const chapterRegex = /^(chapter|part)\s+\d+/i;

  const lineCounts = new Map();
  for (const line of lines) {
    lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
  }

  let userCount = 0;
  let modelCount = 0;
  let codeFenceCount = 0;
  let repeatedLineCount = 0;
  let hasToc = false;
  let hasChapterHeading = false;
  const matchedLineIndices = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;

    if (userRegex.test(line)) {
      userCount++;
      matched = true;
    }
    if (modelRegex.test(line)) {
      modelCount++;
      matched = true;
    }
    if (codeFenceRegex.test(line)) {
      codeFenceCount++;
      matched = true;
    }
    if ((lineCounts.get(line) || 0) >= 3) {
      repeatedLineCount++;
      matched = true;
    }
    if (tocRegex.test(line)) {
      hasToc = true;
    }
    if (chapterRegex.test(line)) {
      hasChapterHeading = true;
    }

    if (matched) {
      matchedLineIndices.add(i);
    }
  }

  const userMarkerDensity = userCount / totalLines;
  const modelMarkerDensity = modelCount / totalLines;
  const codeFenceDensity = codeFenceCount / totalLines;
  const repeatedLineDensity = repeatedLineCount / totalLines;
  const tocAbsenceBonus = hasToc ? 0 : 1;
  const chapterHeadingAbsenceBonus = hasChapterHeading ? 0 : 1;

  // Weighted score (tuned so dense chat logs reach >= 0.70 while book samples stay < 0.40)
  const score =
    0.65 * userMarkerDensity +
    0.65 * modelMarkerDensity +
    0.20 * codeFenceDensity +
    0.40 * repeatedLineDensity +
    0.05 * tocAbsenceBonus +
    0.05 * chapterHeadingAbsenceBonus;

  let confidence = Math.min(Math.max(score * 2.0, 0), 1);

  // Insufficient signal guard: a genuine chat log requires both conversation
  // participants (user and model) and minimum content depth (at least 5 lines).
  if (totalLines < 5 || userCount === 0 || modelCount === 0) {
    confidence = Math.min(confidence, 0.35);
  }

  confidence = Number(confidence.toFixed(4));

  let parseMode = 'book';
  if (confidence >= 0.70) {
    parseMode = 'chat_log';
  }

  return {
    parseMode,
    confidence,
    signals: {
      userMarkerDensity,
      modelMarkerDensity,
      codeFenceDensity,
      repeatedLineDensity,
      tocAbsenceBonus,
      chapterHeadingAbsenceBonus,
      matchedLines: matchedLineIndices.size,
      totalLines,
    },
  };
}

module.exports = { detectChatLog };
