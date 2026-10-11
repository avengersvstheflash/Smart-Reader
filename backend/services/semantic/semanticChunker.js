'use strict';
const crypto = require('crypto');
const { countWords } = require('../../utils/wordCount');

const MAX_CHUNK_CHARS = 8000;
const MAX_CHUNK_SPLIT_ATTEMPTS = 3;

// Regex matching sentence terminators (. ! ? 。 ！ ？) and paragraph breaks
const SENTENCE_BOUNDARY_REGEX = /(?:[.!?]["'”’)]?(?:\s+|\n)|(?:\r?\n){2,}|[。！？]["'”’)]?\s*)/g;

function findLastSentenceBoundary(text, limit) {
  const candidate = text.slice(0, limit);
  let lastIndex = -1;
  let match;
  SENTENCE_BOUNDARY_REGEX.lastIndex = 0;
  while ((match = SENTENCE_BOUNDARY_REGEX.exec(candidate)) !== null) {
    const end = match.index + match[0].length;
    if (text.slice(0, end).trim().length > 0 && text.slice(end).trim().length > 0) {
      lastIndex = end;
    }
  }
  return lastIndex;
}

class SemanticChunker {
  constructor(options = {}) {
    this.targetMinTokens = options.targetMinTokens || 80;   // ~60 words activated (1b)
    this.targetMaxTokens = options.targetMaxTokens || 350;
    this.hardMaxTokens = options.hardMaxTokens || 550;
    this.minWordCount = options.minWordCount || 75; // post-pass merge threshold (1c)
    this.maxChunkChars = options.maxChunkChars || MAX_CHUNK_CHARS;
    this.maxChunkSplitAttempts = options.maxChunkSplitAttempts || MAX_CHUNK_SPLIT_ATTEMPTS;
  }

  chunkPreprocessedUnits(units, bookMetadata = {}) {
    if (!Array.isArray(units) || units.length === 0) return [];

    const chunks = [];
    let currentAccumulator = null;
    let pendingHeading = false;   // (1a) heading glue flag
    let chunkSequence = 0;

    const flushAccumulator = (forceEmit = false) => {
      if (!currentAccumulator) return;
      const combinedText = currentAccumulator.textParts.join('\n\n').trim();
      if (!combinedText) {
        currentAccumulator = null;
        pendingHeading = false;
        return;
      }

      const tokenCount = this.estimateTokens(combinedText);

      // (1b) carry forward if below min and not forced
      if (!forceEmit && tokenCount < this.targetMinTokens) return;

      const chunkId = `chk-${currentAccumulator.bookId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${chunkSequence}`;
      const hash = this.hashContent(`${currentAccumulator.sectionHeading}:${combinedText}`);

      chunks.push({
        id: chunkId,
        bookId: currentAccumulator.bookId,
        chapterId: currentAccumulator.chapterId,
        sequence: chunkSequence++,
        sectionHeading: currentAccumulator.sectionHeading,
        contentType: currentAccumulator.contentType,
        textContent: combinedText,
        canonicalBlock: currentAccumulator.canonicalBlocks.length === 1
          ? currentAccumulator.canonicalBlocks[0]
          : { type: 'composite', blocks: currentAccumulator.canonicalBlocks },
        sourceReference: currentAccumulator.sourceReference,
        sourcePage: currentAccumulator.sourcePage || null,
        structuralRole: currentAccumulator.structuralRole || 'chapter',
        tokenCount,
        contentHash: hash,
        metadata: currentAccumulator.metadata || {},
      });

      currentAccumulator = null;
      pendingHeading = false;
    };

    const commitAccumulator = () => flushAccumulator(true);

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit || !unit.textContent) continue;

      const isAtomic = ['table', 'callout', 'quote', 'list'].includes(unit.contentType);

      if (isAtomic) {
        commitAccumulator();
        const chunkId = `chk-${(unit.bookId || 'bk').slice(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${chunkSequence}`;
        chunks.push({
          id: chunkId,
          bookId: unit.bookId,
          chapterId: unit.chapterId,
          sequence: chunkSequence++,
          sectionHeading: unit.sectionHeading,
          contentType: unit.contentType,
          textContent: unit.textContent,
          canonicalBlock: unit.canonicalBlock,
          sourceReference: unit.sourceReference,
          sourcePage: unit.sourcePage || null,
          structuralRole: unit.structuralRole || 'chapter',
          tokenCount: unit.tokenCount || this.estimateTokens(unit.textContent),
          contentHash: unit.contentHash || this.hashContent(`${unit.sectionHeading}:${unit.textContent}`),
          metadata: {},
        });
        continue;
      }

      // (1a) Heading glue invariant: headings NEVER emitted standalone.
      if (unit.contentType === 'heading') {
        commitAccumulator();
        currentAccumulator = {
          bookId: unit.bookId,
          chapterId: unit.chapterId,
          sectionHeading: unit.sectionHeading,
          contentType: 'paragraph',
          sourceReference: unit.sourceReference,
          sourcePage: unit.sourcePage || null,
          structuralRole: unit.structuralRole || 'chapter',
          textParts: [`[Section: ${unit.textContent}]`],
          canonicalBlocks: [unit.canonicalBlock],
          approxTokens: unit.tokenCount || this.estimateTokens(unit.textContent),
          metadata: {},
        };
        pendingHeading = true;
        continue;
      }

      // Paragraphs / other content
      const unitTokens = unit.tokenCount || this.estimateTokens(unit.textContent);

      if (unitTokens > this.hardMaxTokens) {
        commitAccumulator();
        const sentenceSplits = this.splitBySentences(unit.textContent, this.targetMaxTokens);
        for (const sentenceGroup of sentenceSplits) {
          const chunkId = `chk-${(unit.bookId || 'bk').slice(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${chunkSequence}`;
          chunks.push({
            id: chunkId,
            bookId: unit.bookId,
            chapterId: unit.chapterId,
            sequence: chunkSequence++,
            sectionHeading: unit.sectionHeading,
            contentType: 'paragraph',
            textContent: sentenceGroup,
            canonicalBlock: unit.canonicalBlock,
            sourceReference: unit.sourceReference,
            sourcePage: unit.sourcePage || null,
            structuralRole: unit.structuralRole || 'chapter',
            tokenCount: this.estimateTokens(sentenceGroup),
            contentHash: this.hashContent(`${unit.sectionHeading}:${sentenceGroup}`),
            metadata: {},
          });
        }
        continue;
      }

      if (
        currentAccumulator &&
        currentAccumulator.sectionHeading === unit.sectionHeading &&
        currentAccumulator.approxTokens + unitTokens <= this.targetMaxTokens
      ) {
        currentAccumulator.textParts.push(unit.textContent);
        currentAccumulator.canonicalBlocks.push(unit.canonicalBlock);
        currentAccumulator.approxTokens += unitTokens;
        if (!currentAccumulator.sourcePage && unit.sourcePage) {
          currentAccumulator.sourcePage = unit.sourcePage;
        }
        pendingHeading = false;
      } else {
        commitAccumulator();
        currentAccumulator = {
          bookId: unit.bookId,
          chapterId: unit.chapterId,
          sectionHeading: unit.sectionHeading,
          contentType: 'paragraph',
          sourceReference: unit.sourceReference,
          sourcePage: unit.sourcePage || null,
          structuralRole: unit.structuralRole || 'chapter',
          textParts: [unit.textContent],
          canonicalBlocks: [unit.canonicalBlock],
          approxTokens: unitTokens,
          metadata: {},
        };
        pendingHeading = false;
      }
    }

    // End-of-stream: handle pending heading (merge backward or emit heading_only).
    if (currentAccumulator && pendingHeading) {
      const combinedText = currentAccumulator.textParts.join('\n\n').trim();
      if (chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        prev.textContent = prev.textContent + '\n\n' + combinedText;
        prev.tokenCount = this.estimateTokens(prev.textContent);
        prev.contentHash = this.hashContent(`${prev.sectionHeading}:${prev.textContent}`);
        currentAccumulator = null;
        pendingHeading = false;
      } else {
        console.warn('[semanticChunker] heading-only chapter emitted as fallback');
        if (currentAccumulator) currentAccumulator.metadata = { merged_from: 'heading_only' };
        commitAccumulator();
      }
    }

    commitAccumulator();

    // (1c) Post-pass merge: chunks with word count < minWordCount merge forward/backward.
    // Atomic chunks (table, callout, quote, list) are NEVER merged — they are always emitted intact.
    const atomicTypes = new Set(['table', 'callout', 'quote', 'list']);
    const postPassMerge = (arr) => {
      if (arr.length === 0) return arr;
      const wordCount = (c) => countWords(c.textContent);
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < arr.length; i++) {
          // Never merge atomic chunks
          if (atomicTypes.has(arr[i].contentType)) continue;
          if (wordCount(arr[i]) < this.minWordCount) {
            if (arr.length === 1) break; // single chunk — accept it
            // Prefer merging forward into a non-atomic neighbor
            if (i + 1 < arr.length && !atomicTypes.has(arr[i + 1].contentType)) {
              const merged = arr[i].textContent + '\n\n' + arr[i + 1].textContent;
              arr[i + 1] = {
                ...arr[i + 1],
                textContent: merged.trim(),
                tokenCount: this.estimateTokens(merged.trim()),
                contentHash: this.hashContent(`${arr[i + 1].sectionHeading}:${merged.trim()}`),
              };
              arr.splice(i, 1);
            } else if (i > 0 && !atomicTypes.has(arr[i - 1].contentType)) {
              // Merge backward into a non-atomic neighbor
              const merged = arr[i - 1].textContent + '\n\n' + arr[i].textContent;
              arr[i - 1] = {
                ...arr[i - 1],
                textContent: merged.trim(),
                tokenCount: this.estimateTokens(merged.trim()),
                contentHash: this.hashContent(`${arr[i - 1].sectionHeading}:${merged.trim()}`),
              };
              arr.splice(i, 1);
            } else {
              // Both neighbors are atomic or don't exist — emit undersized chunk as-is
              continue;
            }
            changed = true;
            break;
          }
        }
      }
      // Drop any lone undersized fragments that could not be merged
      const filtered = [];
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        const count = wordCount(c);
        if (count < this.minWordCount) {
          const seq = c.sequence !== undefined ? c.sequence : i;
          console.warn(`[SemanticChunker] Dropping undersized lone fragment (${count}w) at sequence ${seq} — below 75w threshold with no merge target`);
        } else {
          filtered.push(c);
        }
      }
      filtered.forEach((c, idx) => { c.sequence = idx; });
      return filtered;
    };

    return this.enforceMaxChunkSize(postPassMerge(chunks));
  }

  enforceMaxChunkSize(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return chunks;
    const maxChars = this.maxChunkChars || MAX_CHUNK_CHARS;
    const maxAttempts = this.maxChunkSplitAttempts || MAX_CHUNK_SPLIT_ATTEMPTS;
    const result = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const text = chunk.textContent || '';
      const seq = chunk.sequence !== undefined ? chunk.sequence : i;

      if (text.length <= maxChars) {
        result.push(chunk);
        continue;
      }

      let remainingText = text;
      let attempts = 0;
      const splitParts = [];

      while (remainingText.length > maxChars) {
        if (attempts >= maxAttempts) {
          console.warn(
            `[SemanticChunker] Chunk seq ${seq} still ${remainingText.length} chars after ${attempts} attempts. Rejecting — see CHUNK_TOO_LARGE error.`
          );
          throw new Error(
            `CHUNK_TOO_LARGE: chunk ${seq} remained ${remainingText.length} chars ` +
            `after ${maxAttempts} split attempts ` +
            `(limit ${maxChars}). Source material may lack ` +
            `sentence boundaries — check encoding or preprocessing.`
          );
        }

        const splitIdx = findLastSentenceBoundary(remainingText, maxChars);
        if (splitIdx <= 0) {
          console.warn(
            `[SemanticChunker] Chunk seq ${seq} still ${remainingText.length} chars after ${maxAttempts} attempts. Rejecting — see CHUNK_TOO_LARGE error.`
          );
          throw new Error(
            `CHUNK_TOO_LARGE: chunk ${seq} remained ${remainingText.length} chars ` +
            `after ${maxAttempts} split attempts ` +
            `(limit ${maxChars}). Source material may lack ` +
            `sentence boundaries — check encoding or preprocessing.`
          );
        }

        attempts++;
        const part1 = remainingText.slice(0, splitIdx).trim();
        const part2 = remainingText.slice(splitIdx).trim();

        console.log(
          `[SemanticChunker] Split oversized chunk (seq ${seq}, ${remainingText.length} chars) at sentence boundary → ${part1.length} chars + ${part2.length} chars`
        );

        splitParts.push(part1);
        remainingText = part2;
      }

      if (remainingText.length > 0) {
        splitParts.push(remainingText);
      }

      for (let pIdx = 0; pIdx < splitParts.length; pIdx++) {
        const partText = splitParts[pIdx];
        result.push({
          ...chunk,
          id: chunk.id ? `${chunk.id}-p${pIdx}` : `chk-p${pIdx}-${Date.now()}`,
          textContent: partText,
          tokenCount: this.estimateTokens(partText),
          contentHash: this.hashContent(`${chunk.sectionHeading || chunk.section_heading || ''}:${partText}`),
        });
      }
    }

    result.forEach((c, idx) => {
      c.sequence = idx;
    });

    return result;
  }

  splitBySentences(text, maxTokensPerGroup) {
    if (!text) return [];
    // Multilingual sentence matching: English [.!?] followed by whitespace/newline/EOF or closing brackets before CJK,
    // CJK/Japanese [。！？] followed by optional quotes/whitespace/newline/EOF, or line breaks.
    // Handles decimals (e.g. $3.00) and embedded periods without dropping text.
    const CJK_LOOKAHEAD = '(?=[\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\uAC00-\\uD7AF]|$)';
    const TERMINATOR_PATTERN = `(?:` +
      `[.!?]["'”’)\\]」』】）〉》〕］]+(?:\\s+|\\r?\\n|${CJK_LOOKAHEAD})` +
      `|[.!?]["'”’)\\]]?(?:\\s+|\\r?\\n|$)` +
      `|[\\u3002\\uFF01\\uFF1F]["'”’)\\]」』】）〉》〕］]?\\s*` +
      `|(?:\\r?\\n)+` +
    `)`;
    const NON_TERMINATOR = `(?:[^.!?\\u3002\\uFF01\\uFF1F\\r\\n]|[.!?](?!["'”’)\\]」』】）〉》〕］]*(?:\\s|\\r?\\n|[\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\uAC00-\\uD7AF]|$)))`;
    const regex = new RegExp(
      `${NON_TERMINATOR}+${TERMINATOR_PATTERN}|${NON_TERMINATOR}+$`,
      'g'
    );
    const rawSentences = text.match(regex) || [text];
    const groups = [];
    let currentGroup = [];
    let currentTokens = 0;

    const joinGroup = (group) => {
      return group.reduce((acc, s, idx) => {
        if (idx === 0) return s;
        const prev = group[idx - 1];
        const isPrevCjk = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]$/.test(prev);
        const isCurrCjk = /^[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(s);
        return (isPrevCjk || isCurrCjk) ? acc + s : acc + ' ' + s;
      }, '');
    };

    for (const raw of rawSentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokensPerGroup && currentGroup.length > 0) {
        groups.push(joinGroup(currentGroup));
        currentGroup = [sentence];
        currentTokens = sentenceTokens;
      } else {
        currentGroup.push(sentence);
        currentTokens += sentenceTokens;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(joinGroup(currentGroup));
    }

    return groups;
  }

  estimateTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  hashContent(content) {
    return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
  }
}

SemanticChunker.MAX_CHUNK_CHARS = MAX_CHUNK_CHARS;
SemanticChunker.MAX_CHUNK_SPLIT_ATTEMPTS = MAX_CHUNK_SPLIT_ATTEMPTS;

const chunkerInstance = new SemanticChunker();
chunkerInstance.MAX_CHUNK_CHARS = MAX_CHUNK_CHARS;
chunkerInstance.MAX_CHUNK_SPLIT_ATTEMPTS = MAX_CHUNK_SPLIT_ATTEMPTS;

module.exports = chunkerInstance;
