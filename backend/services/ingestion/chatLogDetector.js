/**
 * backend/services/ingestion/chatLogDetector.js
 *
 * Pre-parsing classifier to detect chat-log formatted documents
 * (ChatGPT / Gemini / Claude exports, Kaggle notebook exports, study notes).
 *
 * Prevents standard book parser from mistaking repeated conversational
 * markers ("User:", "User prompt:", "Response:", "Check your answer")
 * for chapter headings.
 *
 * Pure function, zero side-effects, deterministic.
 */

'use strict';

// Extended conversation markers. Catches:
//   User:, User prompt:, User question:, Prompt:, Question:, Human:
//   Model:, Assistant:, Gemini:, ChatGPT:, Claude:, AI:, Response:, Answer:, Bot:
const USER_MARKER_REGEX = /^(user(?:\s+(?:prompt|question|message|query))?|prompt|question|human|q)\s*:/i;
const MODEL_MARKER_REGEX = /^(model|assistant|gemini|chatgpt|claude|ai|response|answer|bot)\s*:/i;

// Notebook-export artifacts (Kaggle / Colab / Jupyter / Gemini exports).
// Their presence argues strongly that the document is a saved conversation,
// not a book.
const NOTEBOOK_ARTIFACT_REGEX = /^(check\s+your\s+answer\.?|save\s+version|open\s+in\s+viewer|save\s+&\s+run|run\s+all|submit(?:\s+via)?|data\/output\s+tab|step_\d+\.check\(\)|\d+\/\d+)$/i;

// Standard book signals — their presence argues against chat_log.
const TOC_REGEX = /^(contents|table of contents)$/i;
const CHAPTER_REGEX = /^(chapter|part)\s+\d+/i;
const CODE_FENCE_REGEX = /^```/;
const URL_REGEX = /^https?:\/\//i;

// Conversation-shape threshold. A document with N+ user prompts AND N+
// assistant responses is conversation-shaped regardless of length.
// Rationale: 3 exchanges is the minimum that reads as a real conversation
// rather than a book quoting a single prompt.
const MIN_TURNS_PER_SIDE = 3;

function detectChatLog(blocks) {
  const emptySignals = {
    userMarkerDensity: 0,
    modelMarkerDensity: 0,
    codeFenceDensity: 0,
    repeatedLineDensity: 0,
    notebookArtifactDensity: 0,
    urlDensity: 0,
    tocAbsenceBonus: 0,
    chapterHeadingAbsenceBonus: 0,
    userCount: 0,
    modelCount: 0,
    notebookArtifactCount: 0,
    matchedLines: 0,
    totalLines: 0,
  };

  if (!blocks) {
    return { parseMode: 'book', confidence: 0, signals: emptySignals };
  }

  const rawBlocks = Array.isArray(blocks) ? blocks : [blocks];
  const lines = [];
  for (const el of rawBlocks) {
    if (el == null) continue;
    const text = typeof el === 'object' && el.text != null ? String(el.text) : String(el);
    if (!text.trim()) continue;
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (const rawLine of normalized.split('\n')) {
      const trimmed = rawLine.trim();
      if (trimmed.length > 0) lines.push(trimmed);
    }
  }

  const totalLines = lines.length;
  if (totalLines === 0) {
    return { parseMode: 'book', confidence: 0, signals: emptySignals };
  }

  const lineCounts = new Map();
  for (const line of lines) {
    lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
  }

  let userCount = 0;
  let modelCount = 0;
  let codeFenceCount = 0;
  let repeatedLineCount = 0;
  let notebookArtifactCount = 0;
  let urlCount = 0;
  let hasToc = false;
  let hasChapterHeading = false;
  const matchedLineIndices = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;

    if (USER_MARKER_REGEX.test(line)) { userCount++; matched = true; }
    if (MODEL_MARKER_REGEX.test(line)) { modelCount++; matched = true; }
    if (CODE_FENCE_REGEX.test(line)) { codeFenceCount++; matched = true; }
    if (NOTEBOOK_ARTIFACT_REGEX.test(line)) { notebookArtifactCount++; matched = true; }
    if (URL_REGEX.test(line)) { urlCount++; matched = true; }
    if ((lineCounts.get(line) || 0) >= 3) { repeatedLineCount++; matched = true; }
    if (TOC_REGEX.test(line)) hasToc = true;
    if (CHAPTER_REGEX.test(line)) hasChapterHeading = true;

    if (matched) matchedLineIndices.add(i);
  }

  const userMarkerDensity = userCount / totalLines;
  const modelMarkerDensity = modelCount / totalLines;
  const codeFenceDensity = codeFenceCount / totalLines;
  const repeatedLineDensity = repeatedLineCount / totalLines;
  const notebookArtifactDensity = notebookArtifactCount / totalLines;
  const urlDensity = urlCount / totalLines;
  const tocAbsenceBonus = hasToc ? 0 : 1;
  const chapterHeadingAbsenceBonus = hasChapterHeading ? 0 : 1;

  // Signal 1: conversation shape (STRONG)
  const hasConversationShape =
    userCount >= MIN_TURNS_PER_SIDE && modelCount >= MIN_TURNS_PER_SIDE;

  // Signal 2: notebook-export artifact shape (STRONG when combined with
  // at least one side of the conversation)
  const hasNotebookShape =
    notebookArtifactCount >= 2 && (userCount >= 1 || modelCount >= 1);

  // Signal 3: density-based weak fallback
  const densityScore =
    0.65 * userMarkerDensity +
    0.65 * modelMarkerDensity +
    0.20 * codeFenceDensity +
    0.40 * repeatedLineDensity +
    0.10 * notebookArtifactDensity +
    0.10 * urlDensity +
    0.05 * tocAbsenceBonus +
    0.05 * chapterHeadingAbsenceBonus;

  let confidence;
  if (hasConversationShape) {
    const turnBonus = Math.min(0.25, 0.05 * Math.min(userCount, modelCount));
    const artifactBonus = Math.min(0.10, 0.03 * notebookArtifactCount);
    confidence = Math.min(1.0, 0.75 + turnBonus + artifactBonus);
  } else if (hasNotebookShape) {
    confidence = 0.72 + Math.min(0.10, 0.03 * notebookArtifactCount);
  } else {
    confidence = Math.min(1, densityScore * 2.0);
    if (userCount === 0 || modelCount === 0 || totalLines < 5) {
      confidence = Math.min(confidence, 0.35);
    }
  }

  confidence = Number(confidence.toFixed(4));
  const parseMode = confidence >= 0.70 ? 'chat_log' : 'book';

  return {
    parseMode,
    confidence,
    signals: {
      userMarkerDensity,
      modelMarkerDensity,
      codeFenceDensity,
      repeatedLineDensity,
      notebookArtifactDensity,
      urlDensity,
      tocAbsenceBonus,
      chapterHeadingAbsenceBonus,
      userCount,
      modelCount,
      notebookArtifactCount,
      matchedLines: matchedLineIndices.size,
      totalLines,
    },
  };
}

module.exports = { detectChatLog };
