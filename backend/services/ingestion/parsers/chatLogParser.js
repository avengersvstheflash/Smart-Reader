/**
 * backend/services/ingestion/parsers/chatLogParser.js
 *
 * Specialized parser branch for chat-log formatted documents
 * (e.g. ChatGPT / Gemini exports, study note transcripts).
 *
 * Decomposes conversational turns into chapters, preserves code fence
 * integrity, suppresses repetitive conversational and pagination noise,
 * and splits overlong turns per D2 soft ceiling (4,000 words).
 *
 * Pure function, zero side-effects, deterministic.
 */

'use strict';

const D2_SOFT_CEILING = 4000;

/**
 * Counts words in a string.
 * @param {string} str
 * @returns {number}
 */
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Cleans user prompt text for use as a chapter title.
 * @param {string} promptText
 * @param {number} turnNumber
 * @returns {string}
 */
function cleanTurnTitle(promptText, turnNumber) {
  if (!promptText) return `Turn ${turnNumber}`;
  let clean = promptText.replace(/^(user(?:\s+(?:prompt|question|message|query))?|prompt|question|human|q)\s*:\s*/i, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^(model|assistant|gemini|chatgpt|claude|ai|response|answer|bot)\s*:\s*/i, '').trim();
  if (!clean) return `Turn ${turnNumber}`;
  if (clean.length > 80) {
    clean = clean.slice(0, 80) + '…';
  }
  return clean;
}

/**
 * Splits a turn's blocks into multiple chapters if word count exceeds ceiling.
 * @param {string} title
 * @param {Array<{type: string, text: string}>} blocks
 * @param {number} ceiling
 * @returns {Array<{title: string, blocks: Array<{type: string, text: string}>}>}
 */
function splitTurnIntoChapters(title, blocks, ceiling = D2_SOFT_CEILING) {
  const turnTotalWords = blocks.reduce((sum, b) => sum + countWords(b.text), 0);
  if (turnTotalWords <= ceiling) {
    return [{ title, blocks }];
  }

  const chapters = [];
  let currentBlocks = [];
  let currentWords = 0;
  let chunkIndex = 0;

  for (const block of blocks) {
    const blockWords = countWords(block.text);

    // If adding this block exceeds ceiling:
    if (currentWords + blockWords > ceiling) {
      // If we already have a substantial chunk (>= 2000 words), split at this paragraph boundary
      if (currentWords >= 2000 && blockWords <= ceiling) {
        chapters.push({
          title: chunkIndex === 0 ? title : `${title} (continued)`,
          blocks: currentBlocks,
        });
        chunkIndex++;
        currentBlocks = [block];
        currentWords = blockWords;
        continue;
      }

      // If current chunk is small or block itself exceeds ceiling: fill up to ceiling
      const wordsNeeded = ceiling - currentWords;
      if (wordsNeeded > 100 && blockWords > wordsNeeded) {
        const words = block.text.trim().split(/\s+/).filter(Boolean);
        const firstSlice = words.slice(0, wordsNeeded).join(' ');
        currentBlocks.push({ type: block.type, text: firstSlice });
        chapters.push({
          title: chunkIndex === 0 ? title : `${title} (continued)`,
          blocks: currentBlocks,
        });
        chunkIndex++;

        // Process remaining words of this block
        const remainingWords = words.slice(wordsNeeded);
        currentBlocks = [];
        currentWords = 0;

        for (let w = 0; w < remainingWords.length; w += ceiling) {
          const slice = remainingWords.slice(w, w + ceiling).join(' ');
          if (w + ceiling >= remainingWords.length) {
            currentBlocks = [{ type: block.type, text: slice }];
            currentWords = countWords(slice);
          } else {
            chapters.push({
              title: chunkIndex === 0 ? title : `${title} (continued)`,
              blocks: [{ type: block.type, text: slice }],
            });
            chunkIndex++;
          }
        }
        continue;
      } else if (currentBlocks.length > 0) {
        chapters.push({
          title: chunkIndex === 0 ? title : `${title} (continued)`,
          blocks: currentBlocks,
        });
        chunkIndex++;
        currentBlocks = [block];
        currentWords = blockWords;
        continue;
      }
    }

    currentBlocks.push(block);
    currentWords += blockWords;
  }

  if (currentBlocks.length > 0) {
    chapters.push({
      title: chunkIndex === 0 ? title : `${title} (continued)`,
      blocks: currentBlocks,
    });
  }

  return chapters;
}

/**
 * Parses raw blocks/lines into structured chat-log chapters.
 *
 * @param {Array<string|{text: string}>|string} blocks
 * @param {object} [options={}]
 * @param {number} [options.parse_confidence=0]
 * @param {object} [options.signals={}]
 * @returns {{
 *   chapters: Array<{title: string, blocks: Array<{type: 'paragraph'|'code', text: string}>}>,
 *   parse_mode: 'chat_log',
 *   parse_confidence: number,
 *   signals: object
 * }}
 */
function parseChatLog(blocks, options = {}) {
  const rawBlocks = Array.isArray(blocks) ? blocks : [blocks];
  const rawLines = [];

  for (const el of rawBlocks) {
    if (el == null) continue;
    const text = typeof el === 'object' && el.text != null ? String(el.text) : String(el);
    if (!text.trim()) continue;

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (const line of normalized.split('\n')) {
      rawLines.push(line);
    }
  }

  const userMarkerRegex = /^(user(?:\s+(?:prompt|question|message|query))?|prompt|question|human|q)\s*:/i;
  const responseMarkerRegex = /^(model|assistant|gemini|chatgpt|claude|ai|response|answer|bot)\s*:\s*/i;
  const noiseCheckRegex = /^(check\s+your\s+answer\.?|step_\d+\.check\(\)|save\s+version|open\s+in\s+viewer|save\s+&\s+run|run\s+all|data\/output\s+tab)$/i;
  const noisePageRegex = /^page\s+\d+\s+of\s+\d+$/i;
  const noiseUrlRegex = /^https?:\/\//i;

  const turns = [];
  let currentTurn = null;
  let inCodeFence = false;
  let codeLines = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0 && currentTurn) {
      currentTurn.rawBlocks.push({
        type: 'paragraph',
        text: paragraphLines.join(' '),
      });
      paragraphLines = [];
    }
  };

  const flushCode = () => {
    if (codeLines.length > 0 && currentTurn) {
      currentTurn.rawBlocks.push({
        type: 'code',
        text: codeLines.join('\n'),
      });
      codeLines = [];
    }
  };

  let turnIndex = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // Check code fence transition
    if (trimmed.startsWith('```')) {
      if (!inCodeFence) {
        // Opening code fence
        flushParagraph();
        inCodeFence = true;
        codeLines = [];
        continue;
      } else {
        // Closing code fence
        inCodeFence = false;
        flushCode();
        continue;
      }
    }

    if (inCodeFence) {
      // Inside code fence: preserve verbatim
      codeLines.push(rawLine);
      continue;
    }

    // Check for new turn boundary
    if (userMarkerRegex.test(trimmed)) {
      flushParagraph();
      flushCode();
      inCodeFence = false;

      currentTurn = {
        title: cleanTurnTitle(trimmed, turnIndex),
        rawBlocks: [],
      };
      turnIndex++;
      turns.push(currentTurn);

      paragraphLines.push(trimmed);
      continue;
    }

    // Outside code fence: check for noise suppression
    if (noiseCheckRegex.test(trimmed) || noisePageRegex.test(trimmed) || noiseUrlRegex.test(trimmed)) {
      flushParagraph();
      continue;
    }

    // Blank line flushes paragraph
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    // Regular line in turn body
    if (!currentTurn) {
      // If content appears before first user prompt, create initial turn
      currentTurn = {
        title: `Turn ${turnIndex}`,
        rawBlocks: [],
      };
      turnIndex++;
      turns.push(currentTurn);
    }

    paragraphLines.push(trimmed);
  }

  // Flush remaining buffers
  flushParagraph();
  flushCode();

  // Process turns into chapters, applying D2 split
  const chapters = [];
  for (const turn of turns) {
    if (turn.rawBlocks.length === 0) continue;
    const split = splitTurnIntoChapters(turn.title, turn.rawBlocks, D2_SOFT_CEILING);
    chapters.push(...split);
  }

  // 5.8.0j.1: normalize chapters to bookService's expected shape.
  // createBatch / chapterRepository requires: content (string),
  // canonicalBlocks (array), wordCount (number), structuralRole (string),
  // sectionCount (number). chatLogParser internally uses { title, blocks }
  // — this maps it to the canonical form without losing block structure.
  const normalizedChapters = chapters.map((ch) => {
    const blocks = Array.isArray(ch.blocks) ? ch.blocks : [];
    const content = blocks.map((b) => b.text || '').join('\n\n').trim();
    const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
    return {
      title: ch.title,
      content,
      canonicalBlocks: blocks,
      wordCount,
      structuralRole: 'chapter',
      sectionCount: 0,
      metadata: { source: 'chat_log_parser' },
    };
  });

  return {
    chapters: normalizedChapters,
    parse_mode: 'chat_log',
    parse_confidence: options.parse_confidence ?? 0,
    signals: options.signals ?? {},
  };
}

module.exports = { parseChatLog };
