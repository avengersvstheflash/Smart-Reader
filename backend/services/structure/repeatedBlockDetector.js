/**
 * Repeated Block Detector for Document Structure Engine (Build 3B.1.6)
 * Detects and filters running headers, running footers, and repeated page number blocks.
 * 
 * Rules:
 * - Detects text blocks that appear on >= 3 non-adjacent pages with identical or near-identical content.
 * - Does NOT remove the first occurrence if it could be a legitimate title/heading; removes subsequent repeats.
 * - Removes repeated page number blocks (e.g. standalone numbers or "Page X of Y").
 * - Never removes legitimate recurring definitions or substantive body prose.
 */

class RepeatedBlockDetector {
  /**
   * Normalizes a text string for repetition comparison
   * (e.g., replaces variable page numbers with #, trims, lowercases)
   */
  normalizePattern(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .trim()
      .replace(/\b\d+\b/g, '#')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * Checks if text is a standalone page number or simple running footer/header artifact
   */
  isPageNumberOrArtifact(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    // Standalone number (e.g., "1", "42", "iv", "xii")
    if (/^\d{1,4}$/.test(trimmed)) return true;
    if (/^[ivxlcdm]{1,8}$/i.test(trimmed)) return true;
    // "Page 12", "Page 12 of 350", "- 12 -"
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(trimmed)) return true;
    if (/^[-—–]\s*\d+\s*[-—–]$/.test(trimmed)) return true;
    // Running header with pipe: "42 | Practical Machine Learning" or "Practical Machine Learning | 42"
    if (/^\d{1,4}\s*\|\s*[^|]{3,60}$/.test(trimmed)) return true;
    if (/^[^|]{3,60}\s*\|\s*\d{1,4}$/.test(trimmed)) return true;
    return false;
  }

  /**
   * Filters running headers/footers and repeated artifacts from canonical blocks
   * @param {Array<object>} blocks - List of canonical blocks (each may have sourcePage, type, text)
   * @param {object} options
   * @returns {{ filteredBlocks: Array<object>, removedCount: number, repeatedSignatures: Set<string> }}
   */
  filterRepeatedBlocks(blocks = [], options = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return { filteredBlocks: [], removedCount: 0, repeatedSignatures: new Set() };
    }

    // Step 1: Map occurrences of normalized text patterns across pages
    const patternPages = new Map(); // pattern -> Set of page numbers
    const patternFirstIndex = new Map(); // pattern -> first block index

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.type === 'heading' && block.level === 1) continue; // Chapter headings are never running headers
      const text = block.text || '';
      if (!text || text.length > 150) continue; // headers/footers are short (<150 chars)

      const page = block.sourcePage !== undefined && block.sourcePage !== null ? block.sourcePage : null;
      const norm = this.normalizePattern(text);
      if (!norm || norm.length < 2) continue;

      if (!patternPages.has(norm)) {
        patternPages.set(norm, new Set());
        patternFirstIndex.set(norm, i);
      }
      if (page !== null) {
        patternPages.get(norm).add(page);
      } else {
        // Fallback: track count if non-paginated
        patternPages.get(norm).add(`idx-${i}`);
      }
    }

    // Step 2: Identify patterns that qualify as running headers/footers:
    // - Appears on >= 3 distinct pages that are not all strictly adjacent, OR
    // - Is a standalone page number appearing >= 2 times
    const runningPatterns = new Set();

    for (const [norm, pages] of patternPages.entries()) {
      if (pages.size >= 3) {
        const pageArr = Array.from(pages).filter((p) => typeof p === 'number').sort((a, b) => a - b);
        if (pageArr.length >= 3) {
          // Check for non-adjacent occurrences (e.g. pages not strictly p, p+1, p+2)
          let hasNonAdjacent = false;
          for (let k = 0; k < pageArr.length - 1; k++) {
            if (pageArr[k + 1] - pageArr[k] > 1) {
              hasNonAdjacent = true;
              break;
            }
          }
          if (hasNonAdjacent || pageArr.length >= 4) {
            runningPatterns.add(norm);
          }
        } else if (pages.size >= 3) {
          runningPatterns.add(norm);
        }
      }
    }

    // Step 3: Filter blocks: keep first occurrence unless it's a pure page number artifact,
    // remove subsequent repeated occurrences
    const filteredBlocks = [];
    const seenFirst = new Set();
    let removedCount = 0;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const text = block.text || '';
      const norm = this.normalizePattern(text);

      const isPageNum = this.isPageNumberOrArtifact(text);
      const isRunning = norm && runningPatterns.has(norm);

      if (isPageNum) {
        // Standalone page numbers should not clutter reading content
        // If seen multiple times or clearly a page number on a page, remove it
        if (seenFirst.has(norm) || patternPages.get(norm)?.size >= 2 || /^\d{1,4}$/.test(text.trim())) {
          removedCount++;
          continue;
        }
        seenFirst.add(norm);
        // If it's the very first page number on page 1, we still generally omit pure digit lines
        if (/^\d{1,4}$/.test(text.trim())) {
          removedCount++;
          continue;
        }
      }

      if (isRunning) {
        if (!seenFirst.has(norm)) {
          // Keep the first occurrence (e.g. title page or chapter heading)
          seenFirst.add(norm);
          filteredBlocks.push(block);
        } else {
          // Drop subsequent repeated occurrences (running header on page 2, 3, 4, etc.)
          removedCount++;
        }
        continue;
      }

      filteredBlocks.push(block);
    }

    return {
      filteredBlocks,
      removedCount,
      repeatedSignatures: runningPatterns,
    };
  }
}

module.exports = new RepeatedBlockDetector();
