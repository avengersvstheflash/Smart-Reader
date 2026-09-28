'use strict';
const crypto = require('crypto');

class SemanticChunker {
  constructor(options = {}) {
    this.targetMinTokens = options.targetMinTokens || 80;   // ~60 words activated (1b)
    this.targetMaxTokens = options.targetMaxTokens || 350;
    this.hardMaxTokens = options.hardMaxTokens || 550;
    this.minWordCount = options.minWordCount || 75; // post-pass merge threshold (1c)
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
      const wordCount = (c) => {
        const t = c.textContent || '';
        return t.trim() === '' ? 0 : t.trim().split(/\s+/).length;
      };
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
      arr.forEach((c, idx) => { c.sequence = idx; });
      return arr;
    };

    return postPassMerge(chunks);
  }

  splitBySentences(text, maxTokensPerGroup) {
    if (!text) return [];
    const rawSentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
    const groups = [];
    let currentGroup = [];
    let currentTokens = 0;

    for (const raw of rawSentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokensPerGroup && currentGroup.length > 0) {
        groups.push(currentGroup.join(' '));
        currentGroup = [sentence];
        currentTokens = sentenceTokens;
      } else {
        currentGroup.push(sentence);
        currentTokens += sentenceTokens;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup.join(' '));
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

module.exports = new SemanticChunker();
