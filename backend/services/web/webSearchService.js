/**
 * Web Search Service for Smart Reader
 * Aggregates results across open, accessible knowledge sources:
 * - Wikipedia / Wikimedia (encyclopedic topics, manga, novels, science, history, reference)
 * - Open Library (books, novels, authors, publications)
 * - Crossref (academic research papers, journals, scholarly articles)
 * - DuckDuckGo Instant Topics (definitions, tech docs, general topics)
 * 
 * Provides unified, structured search results with provenance, snippet, and source types.
 */

class WebSearchService {
  constructor() {
    this.timeoutMs = 6000;
  }

  /**
   * Search across knowledge sources
   * @param {string} query Search terms
   * @param {object} options
   * @param {string} [options.category='all'] 'all' | 'books' | 'research' | 'manga' | 'tech' | 'reference'
   * @param {number} [options.limit=10]
   * @returns {Promise<Array<object>>}
   */
  async search(query, options = {}) {
    if (!query || query.trim() === '') {
      return [];
    }

    const trimmedQuery = query.trim();
    const category = (options.category || 'all').toLowerCase();
    const limit = options.limit || 12;

    const results = [];

    // If query is a direct URL, create a direct URL result first
    if (/^https?:\/\//i.test(trimmedQuery)) {
      try {
        const parsed = new URL(trimmedQuery);
        results.push({
          id: `url-${Date.now()}`,
          title: `Direct Webpage: ${parsed.hostname}${parsed.pathname}`,
          url: trimmedQuery,
          sourceSite: parsed.hostname.replace(/^www\./, ''),
          sourceType: 'document',
          snippet: `Import content directly from web address: ${trimmedQuery}`,
          author: null,
          publishedDate: null,
          isAccessible: true,
        });
      } catch {
        // Not a valid URL, proceed with normal search
      }
    }

    const searchPromises = [];

    if (category === 'all' || category === 'reference' || category === 'manga' || category === 'tech') {
      searchPromises.push(this.searchWikipedia(trimmedQuery, 6));
    }

    if (category === 'all' || category === 'books' || category === 'novel') {
      searchPromises.push(this.searchOpenLibrary(trimmedQuery, 5));
    }

    if (category === 'all' || category === 'research' || category === 'academic') {
      searchPromises.push(this.searchCrossref(trimmedQuery, 5));
    }

    if (category === 'all' || category === 'tech' || category === 'reference') {
      searchPromises.push(this.searchDuckDuckGo(trimmedQuery, 4));
    }

    const settled = await Promise.allSettled(searchPromises);
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }

    // Deduplicate by URL
    const seenUrls = new Set();
    const deduplicated = [];
    for (const item of results) {
      if (!item.url) continue;
      const normalizedUrl = item.url.replace(/\/$/, '').toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        deduplicated.push(item);
      }
    }

    return deduplicated.slice(0, limit);
  }

  /**
   * Search Wikipedia API
   */
  async searchWikipedia(query, max = 5) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=${max}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SmartReader/1.0 (Personal Knowledge Library)' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) return [];
      const data = await res.json();
      if (!data.query || !Array.isArray(data.query.search)) return [];

      return data.query.search.map((item) => {
        const cleanSnippet = (item.snippet || '')
          .replace(/<span class="searchmatch">/g, '')
          .replace(/<\/span>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'");

        const articleSlug = encodeURIComponent(item.title.replace(/\s+/g, '_'));
        const articleUrl = `https://en.wikipedia.org/wiki/${articleSlug}`;

        // Infer source type
        let sourceType = 'reference';
        const titleLower = item.title.toLowerCase();
        const snippetLower = cleanSnippet.toLowerCase();
        if (snippetLower.includes('manga') || snippetLower.includes('anime') || snippetLower.includes('comic')) {
          sourceType = 'manga';
        } else if (snippetLower.includes('novel') || snippetLower.includes('fiction')) {
          sourceType = 'novel';
        } else if (snippetLower.includes('study') || snippetLower.includes('theory') || snippetLower.includes('research')) {
          sourceType = 'research';
        } else if (snippetLower.includes('software') || snippetLower.includes('computer') || snippetLower.includes('algorithm')) {
          sourceType = 'technical';
        }

        return {
          id: `wiki-${item.pageid || Math.random().toString(36).substring(2, 8)}`,
          title: item.title,
          url: articleUrl,
          sourceSite: 'Wikipedia',
          sourceType,
          snippet: cleanSnippet || `Comprehensive reference material on ${item.title}.`,
          author: 'Wikipedia Contributors',
          publishedDate: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : null,
          wordCountEst: item.wordcount || null,
          isAccessible: true,
        };
      });
    } catch (err) {
      console.warn('[WebSearchService] Wikipedia search error:', err.message);
      return [];
    }
  }

  /**
   * Search Open Library API
   */
  async searchOpenLibrary(query, max = 5) {
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${max}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SmartReader/1.0' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) return [];
      const data = await res.json();
      if (!data.docs || !Array.isArray(data.docs)) return [];

      return data.docs.map((doc, idx) => {
        const title = doc.title || 'Untitled Book';
        const author = Array.isArray(doc.author_name) ? doc.author_name.join(', ') : (doc.author_name || 'Unknown Author');
        const year = doc.first_publish_year ? `First published ${doc.first_publish_year}` : '';
        const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 3).join(', ') : '';
        const snippet = [year, subjects ? `Topics: ${subjects}` : ''].filter(Boolean).join(' • ') || `Catalog record for ${title}.`;

        const workKey = doc.key || `/works/OL${idx}`;
        const bookUrl = `https://openlibrary.org${workKey}`;

        return {
          id: `openlib-${doc.cover_edition_key || idx}-${Math.random().toString(36).substring(2, 6)}`,
          title,
          url: bookUrl,
          sourceSite: 'Open Library',
          sourceType: 'book',
          snippet,
          author,
          publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : null,
          isAccessible: true,
        };
      });
    } catch (err) {
      console.warn('[WebSearchService] OpenLibrary search error:', err.message);
      return [];
    }
  }

  /**
   * Search Crossref Academic API
   */
  async searchCrossref(query, max = 5) {
    try {
      const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${max}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SmartReader/1.0 (mailto:reader@smartreader.local)' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) return [];
      const data = await res.json();
      if (!data.message || !Array.isArray(data.message.items)) return [];

      return data.message.items.map((item, idx) => {
        const title = Array.isArray(item.title) ? item.title[0] : (item.title || 'Academic Research Article');
        let author = 'Scholarly Authors';
        if (Array.isArray(item.author) && item.author.length > 0) {
          author = item.author
            .slice(0, 3)
            .map((a) => `${a.given || ''} ${a.family || ''}`.trim())
            .filter(Boolean)
            .join(', ');
          if (item.author.length > 3) author += ' et al.';
        }

        const publisher = item.publisher || 'Academic Journal';
        const year = item.created?.['date-parts']?.[0]?.[0] || '';
        const rawAbstract = item.abstract || '';
        const cleanAbstract = rawAbstract
          .replace(/<[^>]+>/g, '')
          .slice(0, 200);

        const snippet = cleanAbstract 
          ? (cleanAbstract + '...') 
          : `Peer-reviewed scholarly work published by ${publisher}${year ? ` in ${year}` : ''}.`;

        const workUrl = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : `https://api.crossref.org/works/${idx}`);

        return {
          id: `crossref-${item.DOI ? item.DOI.replace(/[^a-zA-Z0-9]/g, '') : idx}`,
          title,
          url: workUrl,
          sourceSite: publisher,
          sourceType: 'research',
          snippet,
          author,
          publishedDate: year ? String(year) : null,
          isAccessible: true,
        };
      });
    } catch (err) {
      console.warn('[WebSearchService] Crossref search error:', err.message);
      return [];
    }
  }

  /**
   * Search DuckDuckGo Instant Topics
   */
  async searchDuckDuckGo(query, max = 4) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SmartReader/1.0' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const results = [];

      if (data.Heading && (data.AbstractText || data.AbstractURL)) {
        results.push({
          id: `ddg-main-${Math.random().toString(36).substring(2, 7)}`,
          title: data.Heading,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          sourceSite: data.AbstractSource || 'DuckDuckGo Knowledge',
          sourceType: 'reference',
          snippet: data.AbstractText || `Key summary for ${data.Heading}`,
          author: null,
          publishedDate: null,
          isAccessible: !!data.AbstractURL,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, max)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              id: `ddg-rel-${Math.random().toString(36).substring(2, 7)}`,
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              url: topic.FirstURL,
              sourceSite: 'DuckDuckGo Reference',
              sourceType: 'article',
              snippet: topic.Text,
              author: null,
              publishedDate: null,
              isAccessible: true,
            });
          }
        }
      }

      return results;
    } catch (err) {
      console.warn('[WebSearchService] DuckDuckGo search error:', err.message);
      return [];
    }
  }
}

module.exports = new WebSearchService();
