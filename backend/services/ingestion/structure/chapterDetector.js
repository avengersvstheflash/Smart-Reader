/**
 * Chapter Detector for Smart Reader
 * Implements confidence-based heuristics to recognize chapters in novel, manga/comic,
 * textbook, or document uploads without overly aggressive splitting of ordinary headings.
 */

class ChapterDetector {
  /**
   * Detects chapters in normalized text
   * @param {string} text Normalized text
   * @param {object} options
   * @returns {Array<{ title: string, rawContent: string }>}
   */
  detect(text, options = {}) {
    if (!text || text.trim() === '') {
      return [{ title: options.defaultTitle || 'Chapter 1', rawContent: '' }];
    }

    const lines = text.split('\n');

    // 1. Scan for explicit chapter & textbook markers
    // Matches:
    // - Chapter 1, CHAPTER 2: The Gateway, Chapter I, Chapter One
    // - Act 1, Part 2, Episode 3, Book 1, Volume 1
    // - Unit 1, Module 2, Section 3
    // - Prologue, Epilogue, Interlude, Preface, Foreword
    // - # Chapter 1, ## Chapter 2
    const explicitChapterPattern = /^(?:#{1,3}\s+)?((?:Chapter|CHAPTER|Episode|EPISODE|Act|ACT|Part|PART|Book|BOOK|Volume|VOLUME|Unit|UNIT|Module|MODULE)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::[^\n]*)?|(?:Prologue|PROLOGUE|Epilogue|EPILOGUE|Interlude|INTERLUDE|Introduction|INTRODUCTION|Preface|PREFACE|Foreword|FOREWORD|Afterword|AFTERWORD)(?::[^\n]*)?)$/i;

    const candidateIndices = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (explicitChapterPattern.test(line)) {
        candidateIndices.push({
          lineIndex: i,
          rawTitle: line,
          confidence: 'high',
          type: 'explicit',
        });
      }
    }

    // 2. If explicit markers are found (at least 1 or 2), segment by these markers
    if (candidateIndices.length > 0) {
      return this.segmentByCandidateIndices(lines, candidateIndices, options);
    }

    // 3. Scan for Academic / Research Paper Section Headings
    // Matches: Abstract, Introduction, Background, Methodology, System Design, Experiments, Results, Discussion, Conclusion, References
    const academicSectionPattern = /^(?:#{1,3}\s+)?(?:\d+\.?\s+)?(Abstract|Introduction|Related Work|Background|Methodology|Methods|System Design|Architecture|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|References|Appendix|Acknowledgments)(?::[^\n]*)?$/i;
    const academicCandidates = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 80) continue;

      if (academicSectionPattern.test(line)) {
        academicCandidates.push({
          lineIndex: i,
          rawTitle: line,
          confidence: 'high',
          type: 'academic_section',
        });
      }
    }

    // If at least 2 distinct academic sections are found with content between them, segment by academic sections
    if (academicCandidates.length >= 2) {
      let validAcademicSplit = true;
      for (let c = 0; c < academicCandidates.length - 1; c++) {
        const gap = academicCandidates[c + 1].lineIndex - academicCandidates[c].lineIndex;
        if (gap < 2) {
          validAcademicSplit = false;
          break;
        }
      }
      if (validAcademicSplit) {
        return this.segmentByCandidateIndices(lines, academicCandidates, options);
      }
    }

    // 4. If no explicit chapter or academic keywords found, check for multiple Level 1 Markdown headings (# Heading)
    // Avoid splitting subheadings (##, ###) which represent sections within a chapter (e.g. ## Methodology).
    const level1HeadingPattern = /^#\s+([^#\n]+)$/;
    const level1Candidates = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(level1HeadingPattern);
      if (match) {
        level1Candidates.push({
          lineIndex: i,
          rawTitle: match[1].trim(),
          confidence: 'medium',
          type: 'level1',
        });
      }
    }

    // Only split on Level 1 headings if there are at least 2 distinct Level 1 headings
    // AND each has non-trivial content between them
    if (level1Candidates.length >= 2) {
      let validSplit = true;
      for (let c = 0; c < level1Candidates.length - 1; c++) {
        const gap = level1Candidates[c + 1].lineIndex - level1Candidates[c].lineIndex;
        if (gap < 3) {
          // Headings clustered too close together (e.g. title + subtitle)
          validSplit = false;
          break;
        }
      }

      if (validSplit) {
        return this.segmentByCandidateIndices(lines, level1Candidates, options);
      }
    }

    // 4. Default: Document is a single continuous chapter (e.g. article, short story, single paper)
    const singleTitle = options.defaultTitle || this.extractFirstHeadingOrTitle(lines) || 'Full Text';
    return [
      {
        title: singleTitle,
        rawContent: text.trim(),
      },
    ];
  }

  /**
   * Segments lines into chapters based on confirmed boundary indices
   */
  segmentByCandidateIndices(lines, candidates, options) {
    const chapters = [];

    // Handle any leading content before the first detected chapter marker
    const firstMarker = candidates[0];
    if (firstMarker.lineIndex > 0) {
      const prologueLines = lines.slice(0, firstMarker.lineIndex);
      const prologueContent = prologueLines.join('\n').trim();

      if (prologueContent.length > 50) {
        // Substantial text before Chapter 1: treat as Prologue / Opening
        const prologueTitle = this.extractFirstHeadingOrTitle(prologueLines) || 'Prologue';
        chapters.push({
          title: prologueTitle,
          rawContent: prologueContent,
        });
      }
    }

    // Segment each chapter
    for (let i = 0; i < candidates.length; i++) {
      const current = candidates[i];
      const startLine = current.lineIndex + 1; // Content starts after heading
      const endLine = i < candidates.length - 1 ? candidates[i + 1].lineIndex : lines.length;

      const contentLines = lines.slice(startLine, endLine);
      const cleanTitle = this.cleanHeadingTitle(current.rawTitle, i + 1);

      chapters.push({
        title: cleanTitle,
        rawContent: contentLines.join('\n').trim(),
      });
    }

    // If for any reason all chapters ended up empty, fallback to single chapter
    const validChapters = chapters.filter((c) => c.rawContent.length > 0 || c.title);
    if (validChapters.length === 0) {
      return [{ title: options.defaultTitle || 'Chapter 1', rawContent: lines.join('\n').trim() }];
    }

    return validChapters;
  }

  /**
   * Cleans a raw heading line into a clean chapter title
   */
  cleanHeadingTitle(raw, fallbackNumber) {
    if (!raw) return `Chapter ${fallbackNumber}`;
    // Strip markdown # symbols and leading/trailing whitespace
    let clean = raw.replace(/^#{1,6}\s*/, '').trim();
    // Normalize extra spaces
    clean = clean.replace(/\s+/g, ' ');
    return clean || `Chapter ${fallbackNumber}`;
  }

  /**
   * Extracts a potential title from the first non-empty line if it looks like a title
   */
  extractFirstHeadingOrTitle(lines) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const hMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (hMatch) return hMatch[1].trim();
      if (trimmed.length < 70 && !/[.?!]$/.test(trimmed)) {
        return trimmed;
      }
      break;
    }
    return null;
  }
}

module.exports = new ChapterDetector();
