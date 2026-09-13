/**
 * Redundancy Detector for Editorial Intelligence (Build 4.1)
 *
 * Clusters candidate sections across sources that refer to the same underlying
 * concept or topic using semantic concepts, title normalization, and keyword/summary overlap.
 *
 * Avoids forcing artificial clusters: unrelated sections remain standalone.
 */

class RedundancyDetector {
  constructor() {
    this.conceptTaxonomy = [
      {
        concept: 'overview_foundations',
        label: 'Overview & Foundational Context',
        patterns: [
          /\b(?:introduction|overview|preface|prologue|background|foundations?|core premise|abstract|genesis|origin)\b/i,
        ],
        keywords: ['overview', 'introduction', 'background', 'context', 'foundations', 'premise'],
      },
      {
        concept: 'narrative_plot',
        label: 'Narrative & Plot Development',
        patterns: [
          /\b(?:plot|synopsis|story|storyline|narrative|premise|events|chronicle)\b/i,
        ],
        keywords: ['plot', 'synopsis', 'story', 'narrative', 'events', 'timeline'],
      },
      {
        concept: 'cast_characters',
        label: 'Cast & Character Analysis',
        patterns: [
          /\b(?:cast|characters?|characterization|protagonists?|antagonists?|personnel|figures|roles)\b/i,
        ],
        keywords: ['cast', 'characters', 'characterization', 'actors', 'protagonists'],
      },
      {
        concept: 'production_development',
        label: 'Production & Creative Development',
        patterns: [
          /\b(?:production|development|filming|making of|design|creation|pre-production|post-production|shooting)\b/i,
        ],
        keywords: ['production', 'development', 'filming', 'design', 'direction'],
      },
      {
        concept: 'critical_reception',
        label: 'Critical Reception & Cultural Impact',
        patterns: [
          /\b(?:reception|critical response|cultural impact|reviews?|box office|acclaim|legacy|critique|audience response)\b/i,
        ],
        keywords: ['reception', 'reviews', 'critical', 'impact', 'box office', 'ratings'],
      },
      {
        concept: 'music_soundtrack',
        label: 'Music & Score Composition',
        patterns: [
          /\b(?:music|soundtrack|score|composer|audio|theme songs?|soundtrack album)\b/i,
        ],
        keywords: ['music', 'soundtrack', 'score', 'composer', 'audio'],
      },
      {
        concept: 'marketing_promotion',
        label: 'Marketing & Promotional Campaigns',
        patterns: [
          /\b(?:marketing|promotion|promotional|trailers?|merchandising|commercials?)\b/i,
        ],
        keywords: ['marketing', 'promotion', 'advertising', 'campaign', 'trailers'],
      },
      {
        concept: 'release_distribution',
        label: 'Release & Global Distribution',
        patterns: [
          /\b(?:release|distribution|premiere|theatrical release|broadcast|syndication)\b/i,
        ],
        keywords: ['release', 'distribution', 'premiere', 'theatrical', 'broadcast'],
      },
      {
        concept: 'sequels_franchise',
        label: 'Sequels & Franchise Continuity',
        patterns: [
          /\b(?:sequels?|franchise|spinoffs?|future installments?|expanded universe|continuity)\b/i,
        ],
        keywords: ['sequels', 'franchise', 'spinoffs', 'universe', 'continuity'],
      },
      {
        concept: 'methodology_design',
        label: 'Methodology & Experimental Design',
        patterns: [
          /\b(?:methodology|methods?|experimental setup|materials and methods|architecture|approach|protocol)\b/i,
        ],
        keywords: ['methodology', 'methods', 'experimental', 'setup', 'framework', 'protocol'],
      },
      {
        concept: 'results_findings',
        label: 'Findings & Empirical Observations',
        patterns: [
          /\b(?:results|findings|observations|data analysis|outcomes|measurements)\b/i,
        ],
        keywords: ['results', 'findings', 'observations', 'data', 'outcomes'],
      },
      {
        concept: 'analysis_discussion',
        label: 'Analysis & Theoretical Implications',
        patterns: [
          /\b(?:discussion|analysis|implications|comparative analysis|limitations|interpretations?)\b/i,
        ],
        keywords: ['discussion', 'analysis', 'implications', 'limitations', 'interpretation'],
      },
      {
        concept: 'conclusion_future',
        label: 'Synthesis & Future Directions',
        patterns: [
          /\b(?:conclusions?|future work|outlook|summary of findings|closing remarks)\b/i,
        ],
        keywords: ['conclusion', 'future work', 'outlook', 'summary', 'closing'],
      },
    ];
  }

  /**
   * Cluster candidate sections into redundant concepts and standalone items
   * @param {Array<object>} sections
   * @returns {Array<object>} Array of cluster objects:
   *   [{ clusterId, label, sectionIds: string[], keywords: string[], sampleTitles: string[] }]
   */
  clusterSections(sections = []) {
    return this.detect(sections);
  }

  detectRedundancy(sections = []) {
    return this.detect(sections);
  }

  detect(sections = []) {
    if (!Array.isArray(sections) || sections.length === 0) {
      const emptyResult = [];
      emptyResult.clusters = [];
      emptyResult.standalone = [];
      return emptyResult;
    }

    // Step 1: Assign sections to concept bins
    const conceptBuckets = new Map();
    const unmappedSections = [];

    for (const sec of sections) {
      const title = (sec.sectionTitle || sec.title || '').trim();
      const cleanTitle = title
        .replace(/^[\[(]?source\s*[\d\w\s]+[:\])\s-]+/i, '')
        .replace(/[\])]+$/, '')
        .trim();

      let matchedConcept = null;
      for (const item of this.conceptTaxonomy) {
        for (const pattern of item.patterns) {
          if (pattern.test(cleanTitle)) {
            matchedConcept = item;
            break;
          }
        }
        if (matchedConcept) break;
      }

      if (matchedConcept) {
        if (!conceptBuckets.has(matchedConcept.concept)) {
          conceptBuckets.set(matchedConcept.concept, {
            concept: matchedConcept.concept,
            label: matchedConcept.label,
            keywords: matchedConcept.keywords,
            sections: [],
          });
        }
        conceptBuckets.get(matchedConcept.concept).sections.push(sec);
      } else {
        unmappedSections.push(sec);
      }
    }

    const clusters = [];
    let clusterIdx = 1;

    // Step 2: Build clusters from concept buckets
    // Multi-section concept buckets become unified clusters
    // Single-section buckets can stand alone or be merged if content matches
    for (const [conceptKey, bucket] of conceptBuckets.entries()) {
      const sectionIds = bucket.sections.map((s) => s.sectionId || s.id);
      const sampleTitles = bucket.sections.map((s) => s.sectionTitle || s.title);

      clusters.push({
        clusterId: `cluster-${clusterIdx++}`,
        concept: conceptKey,
        label: bucket.label,
        sectionIds,
        keywords: bucket.keywords,
        sampleTitles,
        isMultiSource: new Set(bucket.sections.map((s) => s.sourceId || s.bookId)).size > 1,
      });
    }

    // Step 3: Check unmapped sections for semantic/keyword overlap
    const assignedUnmapped = new Set();
    for (let i = 0; i < unmappedSections.length; i++) {
      if (assignedUnmapped.has(i)) continue;
      const secA = unmappedSections[i];
      const tokensA = this.extractTokens(secA);

      const group = [secA];
      assignedUnmapped.add(i);

      for (let j = i + 1; j < unmappedSections.length; j++) {
        if (assignedUnmapped.has(j)) continue;
        const secB = unmappedSections[j];
        const tokensB = this.extractTokens(secB);

        const similarity = this.calculateJaccard(tokensA, tokensB);
        // Only cluster if significant semantic overlap
        if (similarity >= 0.45 && tokensA.size > 2 && tokensB.size > 2) {
          group.push(secB);
          assignedUnmapped.add(j);
        }
      }

      const secIds = group.map((s) => s.sectionId || s.id);
      const sampleTitles = group.map((s) => s.sectionTitle || s.title);
      const label = group.length > 1
        ? this.deriveClusterLabel(group)
        : (secA.sectionTitle || secA.title || `Section ${secIds[0]}`);

      clusters.push({
        clusterId: `cluster-${clusterIdx++}`,
        label,
        sectionIds: secIds,
        keywords: Array.from(tokensA).slice(0, 5),
        sampleTitles,
        isMultiSource: new Set(group.map((s) => s.sourceId || s.bookId)).size > 1,
      });
    }

    // Attach convenience properties
    const multiClusters = clusters.filter((c) => c.sectionIds.length > 1);
    const standaloneClusters = clusters.filter((c) => c.sectionIds.length === 1);

    clusters.clusters = multiClusters;
    clusters.standalone = standaloneClusters;

    return clusters;
  }

  extractTokens(section) {
    const text = `${section.sectionTitle || section.title || ''} ${section.summary || ''} ${(section.keywords || []).join(' ')}`.toLowerCase();
    const words = text.match(/[a-z]{3,}/g) || [];
    const stopwords = new Set([
      'the', 'and', 'for', 'that', 'with', 'from', 'this', 'were', 'which', 'their', 'about',
      'source', 'chapter', 'section', 'part', 'page', 'book', 'text', 'also', 'have',
    ]);
    return new Set(words.filter((w) => !stopwords.has(w)));
  }

  calculateJaccard(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  deriveClusterLabel(group) {
    const titles = group.map((s) => (s.sectionTitle || s.title || '').replace(/^[\[(]?source\s*\d+[^\])]*[\])]?\s*/i, '').trim());
    return titles[0] || 'Topical Group';
  }
}

module.exports = new RedundancyDetector();
