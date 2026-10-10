/**
 * aiRetryGuard.js - Centralized word-count validation and retry guard for LLM generation
 * Phase 5.6: Validation and Refine Loops
 *
 * Enforces:
 * 1. Word count bounds [hardFloor, hardCeiling]
 * 2. Structural integrity (sentence terminators and lexical diversity to reject placeholder text)
 * 3. Corrective re-prompting with explicit violation feedback
 * 4. Transparent logging: [aiRetryGuard] contextLabel | attempt N | words: X (bounds [F, C]) | violation: TYPE | retried: bool
 */

class AIRetryGuard {
  /**
   * Count words in string using standard whitespace tokenizer.
   * @param {string} text
   * @returns {number}
   */
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Check structural integrity of generated text.
   * Requires:
   * - At least 3 sentence terminators (. ! ?)
   * - Distinct word ratio above threshold to prevent uniform repetition
   *
   * @param {string} text
   * @param {number} wordCount
   * @returns {boolean} true if structurally valid
   */
  checkStructure(text, wordCount) {
    if (!text || typeof text !== 'string') return false;
    if (wordCount < 20) {
      return false;
    }

    const terminators = text.match(/[.!?](\s+|$|["'”’])/g) || [];
    if (terminators.length < 3) {
      return false;
    }

    const tokens = text.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
    if (tokens.length >= 20) {
      const uniqueTokens = new Set(tokens);
      const diversityRatio = uniqueTokens.size / tokens.length;
      if (diversityRatio < 0.25 || uniqueTokens.size < 8) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute generation with word count, structural validation, and retry loop.
   */
  async executeWithWordCountGuard({
    generateFn,
    prompt,
    tightenedPrompt,
    bounds,
    maxRetries = 1,
    contextLabel = '[AI Guard]',
    structuralCheck = true,
  }) {
    if (typeof generateFn !== 'function') {
      throw new Error('[aiRetryGuard] generateFn must be a callable function');
    }

    const { targetWords = 250, hardFloor = 180, hardCeiling = 360 } = bounds || {};
    let currentPrompt = prompt;
    let attempt = 0;
    let retried = false;
    let lastResult = null;
    let lastText = '';
    let lastWordCount = 0;
    let finishReason = 'stop';
    let violation = false;
    let violationType = null;

    while (attempt <= maxRetries) {
      attempt++;
      violation = false;
      violationType = null;

      const genResponse = await generateFn(currentPrompt);
      lastResult = genResponse;

      const text = (genResponse && (genResponse.text || genResponse.summary || genResponse.content || '')) || '';
      lastText = typeof text === 'string' ? text : String(text);
      lastWordCount = this.countWords(lastText);
      finishReason = (genResponse && genResponse.finish_reason) || (genResponse && genResponse.finishReason) || 'stop';

      if (structuralCheck && !this.checkStructure(lastText, lastWordCount)) {
        violation = true;
        violationType = 'structural_placeholder';
      }

      if (!violation && (lastWordCount < hardFloor || lastWordCount > hardCeiling)) {
        violation = true;
        violationType = 'word_count';
      }

      const logMsg = `[aiRetryGuard] ${contextLabel} | attempt ${attempt} | words: ${lastWordCount} (bounds [${hardFloor}, ${hardCeiling}]) | violation: ${violationType || 'none'} | retried: ${retried}`;
      if (violation) {
        console.warn(logMsg);
      } else {
        console.log(logMsg);
      }

      if (!violation) {
        return {
          text: lastText,
          wordCount: lastWordCount,
          violation: false,
          retried,
          finishReason,
          attempt,
          violationType: null,
          rawResponse: lastResult,
        };
      }

      if (attempt <= maxRetries) {
        retried = true;
        if (typeof tightenedPrompt === 'function') {
          currentPrompt = tightenedPrompt(lastWordCount, bounds, violationType, lastText);
        } else if (typeof tightenedPrompt === 'string' && tightenedPrompt.trim().length > 0) {
          currentPrompt = tightenedPrompt;
        } else if (violationType === 'structural_placeholder') {
          currentPrompt = `${prompt}\n\nIMPORTANT CONSTRAINT CORRECTION: Your previous output lacked normal sentence structure or vocabulary variety. Write in complete, natural English sentences with standard punctuation (. ! ?) and distinct prose paragraphs. Required word count: ${targetWords}. Floor: ${hardFloor}, Ceiling: ${hardCeiling}.`;
        } else {
          const draftSection = lastText && lastText.trim().length > 0
            ? ` Here is the draft you produced:\n===\n${lastText.trim()}\n===\n`
            : ' ';
          currentPrompt = `${prompt}\n\nIMPORTANT CONSTRAINT CORRECTION: Your previous attempt was ${lastWordCount} words, which violates the required length.${draftSection}Return exactly ${targetWords} words. Do not exceed ${hardCeiling} words. Hard bounds: ${hardFloor} minimum, ${hardCeiling} maximum.`;
        }
      }
    }

    return {
      text: lastText,
      wordCount: lastWordCount,
      violation: true,
      retried,
      finishReason,
      attempt,
      violationType,
      rawResponse: lastResult,
    };
  }
}

module.exports = new AIRetryGuard();
