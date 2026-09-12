const crypto = require('crypto');

class SemanticChunker {
  constructor(options = {}) {
    this.targetMinTokens = options.targetMinTokens || 80;
    this.targetMaxTokens = options.targetMaxTokens || 350;
    this.hardMaxTokens = options.hardMaxTokens || 550;
  }

  chunkPreprocessedUnits(units, bookMetadata = {}) {
    if (!Array.isArray(units) || units.length === 0) return [];

    const chunks = [];
    let currentAccumulator = null;
    let chunkSequence = 0;

    const flushAccumulator = () => {
      if (!currentAccumulator) return;
      const combinedText = currentAccumulator.textParts.join('\n\n').trim();
      if (!combinedText) {
        currentAccumulator = null;
        return;
      }

      const chunkId = `chk-${currentAccumulator.bookId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${chunkSequence}`;
      const tokenCount = this.estimateTokens(combinedText);
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
        tokenCount,
        contentHash: hash,
      });

      currentAccumulator = null;
    };

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit || !unit.textContent) continue;

      // Atomic structural units: Tables, Callouts, Blockquotes, Lists
      // These should NEVER be split across unrelated chunks
      const isAtomic = ['table', 'callout', 'quote', 'list'].includes(unit.contentType);

      if (isAtomic) {
        flushAccumulator();

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
          tokenCount: unit.tokenCount || this.estimateTokens(unit.textContent),
          contentHash: unit.contentHash || this.hashContent(`${unit.sectionHeading}:${unit.textContent}`),
        });
        continue;
      }

      // Headings
      if (unit.contentType === 'heading') {
        flushAccumulator();
        // Start new accumulator under this heading
        currentAccumulator = {
          bookId: unit.bookId,
          chapterId: unit.chapterId,
          sectionHeading: unit.sectionHeading,
          contentType: 'paragraph',
          sourceReference: unit.sourceReference,
          textParts: [`[Section: ${unit.textContent}]`],
          canonicalBlocks: [unit.canonicalBlock],
          approxTokens: unit.tokenCount || this.estimateTokens(unit.textContent),
        };
        continue;
      }

      // Paragraphs
      const unitTokens = unit.tokenCount || this.estimateTokens(unit.textContent);

      // If unit alone exceeds hardMaxTokens, split cleanly by sentences
      if (unitTokens > this.hardMaxTokens) {
        flushAccumulator();
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
            tokenCount: this.estimateTokens(sentenceGroup),
            contentHash: this.hashContent(`${unit.sectionHeading}:${sentenceGroup}`),
          });
        }
        continue;
      }

      // Accumulate with existing group if same section and within budget
      if (
        currentAccumulator &&
        currentAccumulator.sectionHeading === unit.sectionHeading &&
        currentAccumulator.approxTokens + unitTokens <= this.targetMaxTokens
      ) {
        currentAccumulator.textParts.push(unit.textContent);
        currentAccumulator.canonicalBlocks.push(unit.canonicalBlock);
        currentAccumulator.approxTokens += unitTokens;
      } else {
        // Exceeds budget or new section
        flushAccumulator();
        currentAccumulator = {
          bookId: unit.bookId,
          chapterId: unit.chapterId,
          sectionHeading: unit.sectionHeading,
          contentType: 'paragraph',
          sourceReference: unit.sourceReference,
          textParts: [unit.textContent],
          canonicalBlocks: [unit.canonicalBlock],
          approxTokens: unitTokens,
        };
      }
    }

    flushAccumulator();
    return chunks;
  }

  splitBySentences(text, maxTokensPerGroup) {
    if (!text) return [];
    // Split on sentence boundaries: periods, exclamation points, questions followed by space or newline
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
