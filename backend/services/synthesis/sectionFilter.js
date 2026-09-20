/**
 * Section Filter for Editorial Intelligence (Build 4.1)
 *
 * Classifies extracted or detected sections as either 'editorial_candidate'
 * or 'low_information' (author, date, degree, college, committee, bibliography,
 * citation metadata, share, navigation, subscription, sign-in, separator, <50 words with no summary).
 *
 * Excluded sections are NOT deleted; they are preserved in original sources
 * but filtered out from editorial outline planning.
 */

class SectionFilter {
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  /**
   * Filter an array of section descriptors
   * @param {Array<object>} sections - Array of section descriptors:
   *   { sectionId, sourceId, sourceTitle, sectionTitle, sectionType, contentType, wordCount, summary, keywords }
   * @returns {{ candidates: Array<object>, filtered: Array<object> }}
   */
  filter(sections = []) {
    if (!Array.isArray(sections)) {
      return { candidates: [], filtered: [] };
    }

    const candidates = [];
    const filtered = [];

    for (const section of sections) {
      const evaluation = this.evaluateSection(section);

      if (evaluation.isCandidate) {
        candidates.push({
          ...section,
          status: 'editorial_candidate',
        });
      } else {
        const filteredEntry = {
          ...section,
          status: evaluation.status || 'low_information',
          reason: evaluation.reason,
        };
        filtered.push(filteredEntry);
        this.logFilterReason(section, evaluation.reason);
      }
    }

    return { candidates, filtered };
  }

  /**
   * Evaluate a single section
   * @param {object} section
   * @returns {{ isCandidate: boolean, reason?: string }}
   */
  evaluateSection(section) {
    if (!section) {
      return { isCandidate: false, reason: 'empty_section' };
    }

    const title = (section.sectionTitle || section.title || '').trim();
    const cleanTitle = title.toLowerCase().replace(/^[\[(]?source\s*\d+[^\])]*[\])]?\s*/i, '').trim();
    const type = (section.sectionType || section.type || '').toLowerCase();
    const wordCount = typeof section.wordCount === 'number' ? section.wordCount : (section.content ? section.content.split(/\s+/).filter(Boolean).length : 0);
    const summary = (section.summary || '').trim();
    const hasSubstantiveSummary = summary.length >= 20;

    // 1. Separator blocks
    if (type === 'separator' || /^[-—_=\s*~]{3,}$/.test(cleanTitle)) {
      return { isCandidate: false, reason: 'separator' };
    }

    // 1.2 Non-body structural roles (front_matter, back_matter, index, appendix)
    const role = (section.structuralRole || section.structural_role || '').toLowerCase();
    if (role && (role === 'front_matter' || role === 'back_matter' || role === 'index' || role === 'appendix')) {
      // If it looks like a preface, preserve reason: 'preface' for intelligentSummarizer
      if (/^(?:preface|foreword|prologue|introduction to the (?:edition|book))$/i.test(cleanTitle)) {
        return { isCandidate: false, reason: 'preface', status: 'front_matter' };
      }
      return { isCandidate: false, reason: role, status: 'excluded_structural_role' };
    }

    // 1.5 Preface & Front Matter
    const prefacePatterns = [
      /^(?:preface|foreword|prologue|introduction to the (?:edition|book))$/i,
    ];
    for (const pat of prefacePatterns) {
      if (pat.test(cleanTitle)) {
        return { isCandidate: false, reason: 'preface', status: 'front_matter' };
      }
    }

    // 2. Navigation, UI chrome, social & subscription
    const navPatterns = [
      /^(?:navigation|nav|menu|table of contents|contents|toc)$/i,
      /^(?:share|share this|social|follow us|connect)$/i,
      /^(?:subscribe|subscription|newsletter|sign[-\s]?up)$/i,
      /^(?:sign[-\s]?in|log[-\s]?in|login|logout|register|my account)$/i,
      /^(?:footer|header|sidebar|banner|advertisement|ads)$/i,
      /^(?:privacy policy|terms of (?:service|use)|cookie policy|disclaimer|copyright notice)$/i,
    ];

    for (const pat of navPatterns) {
      if (pat.test(cleanTitle)) {
        return { isCandidate: false, reason: 'navigation' };
      }
    }

    // 3. Bibliography, citations, and reference metadata
    const biblioPatterns = [
      /^(?:references|bibliography|works cited|citations?|further reading|see also|external links|sources|notes and references)(?:\s+(?:and|&)\s+(?:works cited|references|sources|citations))?$/i,
      /\b(?:bibliography|references|works cited|further reading|external links)\b/i,
      /^(?:citation metadata|citing this article|doi|isbn|issn)$/i,
    ];

    for (const pat of biblioPatterns) {
      if (pat.test(cleanTitle)) {
        return { isCandidate: false, reason: 'bibliography' };
      }
    }

    // 4. Author and Date metadata
    const authorBylineExact = /^(?:author[s]?|byline|written by|contributors?|author information|about the author[s]?)(?:\s*[:\-]\s*.*)?$/i;
    if (authorBylineExact.test(cleanTitle)) {
      if (wordCount < 120 && !hasSubstantiveSummary) {
        return { isCandidate: false, reason: 'author_metadata' };
      }
    }

    const dateExact = /^(?:date|publication date|published date|published|timestamp)(?:\s*[:\-]\s*.*)?$/i;
    if (dateExact.test(cleanTitle)) {
      if (wordCount < 100 && !hasSubstantiveSummary) {
        return { isCandidate: false, reason: 'date_metadata' };
      }
    }

    // 5. Academic committee, degree, college administrative boilerplate
    const academicMetaExact = /^(?:degree[s]?|committee|advisory committee|thesis committee|dissertation committee|college|department)$/i;
    if (academicMetaExact.test(cleanTitle)) {
      if (wordCount < 100 && !hasSubstantiveSummary) {
        return { isCandidate: false, reason: 'academic_administrative_metadata' };
      }
    }

    // 6. Minimum content threshold (<50 words with no summary)
    if (wordCount < 50 && !hasSubstantiveSummary) {
      return { isCandidate: false, reason: 'insufficient_content' };
    }

    // Passed all filter criteria: this is a genuine editorial candidate
    return { isCandidate: true };
  }

  /**
   * Log filter action with justification
   */
  logFilterReason(section, reason) {
    const title = section.sectionTitle || section.title || '(untitled)';
    const id = section.sectionId || section.id || '(no-id)';
    this.logger.debug?.(`[SectionFilter] Filtered "${title}" (${id}): ${reason}`) ||
    this.logger.log?.(`[SectionFilter] Filtered "${title}" (${id}): ${reason}`);
  }
}

module.exports = new SectionFilter();
