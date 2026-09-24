const aiService = require('./aiService');
const bookRepository = require('../../repositories/bookRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const jobRepository = require('../../repositories/jobRepository');
const { getDatabase } = require('../../db/database');

class BookBibliographer {
  /**
   * Extract bibliographic metadata (publisher, publication year, ISBN, edition,
   * authors, editors, copyright holder, language, subtitle, series) from canonical source.
   *
   * @param {string} bookId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async extractBibliographic(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const ownJob = !options.jobId && !options.skipJobCreation;
    const jobId = options.jobId || `job-biblio-${bookId}-${Date.now()}`;

    if (ownJob) {
      jobRepository.create({
        id: jobId,
        book_id: bookId,
        type: 'CLASSIFICATION',
        status: 'PROCESSING',
        progress: 10,
      });
    }

    try {
      // 1. Gather text from semantic chunks (ordered by sequence)
      const chunks = semanticChunkRepository.getByBookId(bookId) || [];
      let fullText = chunks.map((c) => c.textContent || '').join('\n\n').trim();

      // Fallback to chapter content if semantic chunks are empty
      if (!fullText) {
        const chapters = chapterRepository.getByBookId(bookId) || [];
        fullText = chapters.map((ch) => ch.content || '').join('\n\n').trim();
      }

      // Take first 1600 words + last 1600 words separated by " — — — "
      const words = fullText.split(/\s+/).filter(Boolean);
      let snippetText = '';
      if (words.length <= 3200) {
        snippetText = words.join(' ');
      } else {
        const head = words.slice(0, 1600).join(' ');
        const tail = words.slice(-1600).join(' ');
        snippetText = `${head}\n\n— — —\n\n${tail}`;
      }

      if (jobId) {
        jobRepository.update(jobId, { progress: ownJob ? 30 : 80 });
      }

      let bibliographicResult = null;
      let fellBack = false;
      let fallbackReason = null;

      // 2. LLM Extraction (unless fast option is true)
      if (!options.fast && snippetText.trim()) {
        const prompt = `You are extracting bibliographic metadata for a personal library system. Given the beginning and ending passages of a document (joined by "— — —" indicating omitted middle content), extract factual publication and bibliographic metadata. Output JSON only, no prose.

{
  "publisher": string | null,
  "publication_year": number | null,
  "isbn": string | null,
  "edition": string | null,
  "authors": string[],
  "editors": string[],
  "copyright_holder": string | null,
  "language": string | null,
  "subtitle": string | null,
  "series": string | null
}

RULES:
- Only extract facts actually present in the input. Do not infer, guess, or extrapolate.
- If a field is not explicitly present, set it to null (or [] for array fields). Honest absence beats fabrication.
- Do NOT hallucinate standard publishers (e.g. O'Reilly, CRC) if they don't appear. Non-books (reports, papers, SEC filings) will have mostly nulls — this is expected and correct.
- publisher: string or null. Only if explicitly identified as publisher or "published by". Do NOT treat corporate filers (e.g. Apple Inc. in a 10-K) or government regulatory bodies/agencies (e.g. U.S. Securities and Exchange Commission) as publishers unless the document explicitly states "Published by".
- Do NOT invent an ISBN. Do NOT guess a publication year.
- "language" should be ISO 639-1 when determinable ("en", "ja", "de", "fr", "es", "zh", etc.), else null.
- "publication_year" must be an integer year (e.g. 2025) or null. If multiple years appear, take original publication year, else most recent copyright year.
- edition: e.g. '2nd edition', 'Revised edition', or null.
- authors / editors: arrays of full name strings.
- Output valid JSON only. No markdown fences. No explanation.

INPUT:
Title: ${book.title}
Author: ${book.author || 'Unknown Author'}

TEXT PASSAGES:
${snippetText}

OUTPUT:`;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const provider = aiService.getActiveProvider();
            const health = await provider.checkHealth();
            if (!health || !health.available) break;

            if (jobId) {
              jobRepository.update(jobId, { progress: ownJob ? 50 : 85 });
            }

            const timeoutMs = options.timeout || 25000;
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('AI bibliographic extraction timeout')),
                timeoutMs
              )
            );

            const response = await Promise.race([
              provider.summarize({
                text: prompt,
                title: book.title,
                options: {
                  isPrompt: true,
                  task: 'bibliographic',
                  maxTokens: 600,
                  reasoning: { enabled: false },
                  ...options,
                },
              }),
              timeoutPromise,
            ]);

            if (response && response.summary) {
              const cleaned = response.summary
                .replace(/```(?:json)?/gi, '')
                .replace(/```/g, '')
                .trim();
              const parsed = JSON.parse(cleaned);

              if (parsed && typeof parsed === 'object') {
                bibliographicResult = this.normalizeBibliographic(parsed);
                fellBack = false;
                break;
              }
            }
          } catch (err) {
            console.warn(
              `[BookBibliographer] Attempt ${attempt} failed for book ${bookId}:`,
              err.message
            );
            fallbackReason = err.message;
          }
        }
      }

      // 3. Deterministic Heuristic Fallback
      if (!bibliographicResult) {
        fellBack = true;
        bibliographicResult = this.heuristicFallback(
          snippetText,
          book,
          fallbackReason || 'Model unavailable or unparseable response'
        );
      }

      if (jobId) {
        jobRepository.update(jobId, { progress: ownJob ? 90 : 95 });
      }

      const bibliographicData = {
        publisher: bibliographicResult.publisher,
        publication_year: bibliographicResult.publication_year,
        isbn: bibliographicResult.isbn,
        edition: bibliographicResult.edition,
        authors: bibliographicResult.authors,
        editors: bibliographicResult.editors,
        copyright_holder: bibliographicResult.copyright_holder,
        language: bibliographicResult.language,
        subtitle: bibliographicResult.subtitle,
        series: bibliographicResult.series,
        fell_back: fellBack,
        ...(fellBack
          ? {
              fallback_reason:
                bibliographicResult.fallback_reason ||
                fallbackReason ||
                'Deterministic fallback invoked',
            }
          : {}),
        extractedAt: new Date().toISOString(),
      };

      // 4. Merge into books.metadata_json.bibliographic
      const db = getDatabase();
      const currentBook = bookRepository.getById(bookId);
      const currentMeta =
        typeof currentBook.metadata_json === 'string'
          ? JSON.parse(currentBook.metadata_json || '{}')
          : currentBook.metadata_json || {};

      const updatedMeta = {
        ...currentMeta,
        bibliographic: bibliographicData,
      };

      db.prepare(
        'UPDATE books SET metadata_json = ?, updated_at = ? WHERE id = ?'
      ).run(
        JSON.stringify(updatedMeta),
        new Date().toISOString(),
        bookId
      );

      if (ownJob) {
        jobRepository.complete(jobId);
      }

      return bibliographicData;
    } catch (err) {
      console.error(
        `[BookBibliographer] Error extracting bibliographic metadata for ${bookId}:`,
        err
      );
      if (ownJob) {
        jobRepository.fail(jobId, err.message);
      }
      throw err;
    }
  }

  /**
   * Normalize and validate structured bibliographic JSON from LLM
   */
  normalizeBibliographic(raw) {
    const publisher =
      typeof raw.publisher === 'string' && raw.publisher.trim()
        ? raw.publisher.trim()
        : null;

    let publicationYear = null;
    if (
      typeof raw.publication_year === 'number' &&
      !isNaN(raw.publication_year)
    ) {
      publicationYear = Math.round(raw.publication_year);
    } else if (
      typeof raw.publication_year === 'string' &&
      /^\d{4}$/.test(raw.publication_year.trim())
    ) {
      publicationYear = parseInt(raw.publication_year.trim(), 10);
    }

    const isbn =
      typeof raw.isbn === 'string' && raw.isbn.trim()
        ? raw.isbn.trim()
        : null;

    const edition =
      typeof raw.edition === 'string' && raw.edition.trim()
        ? raw.edition.trim()
        : null;

    const authors = Array.isArray(raw.authors)
      ? raw.authors
          .map((a) => (typeof a === 'string' ? a.trim() : ''))
          .filter(Boolean)
      : [];

    const editors = Array.isArray(raw.editors)
      ? raw.editors
          .map((e) => (typeof e === 'string' ? e.trim() : ''))
          .filter(Boolean)
      : [];

    const copyrightHolder =
      typeof raw.copyright_holder === 'string' && raw.copyright_holder.trim()
        ? raw.copyright_holder.trim()
        : null;

    let language =
      typeof raw.language === 'string' && raw.language.trim()
        ? raw.language.trim().toLowerCase()
        : null;

    if (language) {
      const langMap = {
        english: 'en',
        japanese: 'ja',
        french: 'fr',
        german: 'de',
        spanish: 'es',
        chinese: 'zh',
        italian: 'it',
        russian: 'ru',
      };
      if (langMap[language]) {
        language = langMap[language];
      } else if (!/^[a-z]{2}(-[a-z]{2})?$/.test(language)) {
        language = null;
      }
    }

    const subtitle =
      typeof raw.subtitle === 'string' && raw.subtitle.trim()
        ? raw.subtitle.trim()
        : null;

    const series =
      typeof raw.series === 'string' && raw.series.trim()
        ? raw.series.trim()
        : null;

    return {
      publisher,
      publication_year: publicationYear,
      isbn,
      edition,
      authors,
      editors,
      copyright_holder: copyrightHolder,
      language,
      subtitle,
      series,
    };
  }

  /**
   * Deterministic heuristic fallback using regex extraction
   */
  heuristicFallback(text, book, fallbackReason = 'Model unavailable') {
    if (!text || typeof text !== 'string') {
      return {
        publisher: null,
        publication_year: null,
        isbn: null,
        edition: null,
        authors: book?.author && book.author !== 'Unknown Author' ? [book.author] : [],
        editors: [],
        copyright_holder: null,
        language: null,
        subtitle: null,
        series: null,
        fell_back: true,
        fallback_reason: fallbackReason,
      };
    }

    // 1. ISBN-10 or ISBN-13
    let isbn = null;
    const isbnMatch = text.match(
      /(?:ISBN(?:-1[03])?:?\s*)(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X]|[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X])/i
    );
    if (isbnMatch && isbnMatch[1]) {
      isbn = isbnMatch[1].trim();
    }

    // 2. Copyright year & copyright holder
    let publication_year = null;
    let copyright_holder = null;
    const yearMatch = text.match(
      /(?:Copyright\s*(?:©|\(c\)|&copy;)?|©)\s*(\d{4})/i
    );
    if (yearMatch) {
      publication_year = parseInt(yearMatch[1], 10);
      const afterYear = text.slice(yearMatch.index + yearMatch[0].length);
      const lineMatch = afterYear.match(/^(?:[\s,]+(?:by\s+)?([^\n\r]+))/i);
      if (lineMatch && lineMatch[1]) {
        copyright_holder =
          lineMatch[1]
            .trim()
            .replace(/\s*all rights reserved.*$/i, '')
            .trim() || null;
      }
    }

    // 3. Publisher
    let publisher = null;
    const pubMatch = text.match(
      /(?:(?:published\s+by|publisher:?)\s+([^\n\r,.]+?))(?=\s*(?:\.|\n|\r|,|4 Park Square|2385|$))/i
    );
    if (pubMatch && pubMatch[1] && pubMatch[1].trim()) {
      publisher = pubMatch[1].trim();
    } else {
      const knownPubs = [
        'CRC Press',
        'Taylor & Francis',
        'Routledge',
        'O\'Reilly',
        'Addison-Wesley',
        'Manning',
        'Springer',
        'Wiley',
        'MIT Press',
        'Cambridge University Press',
        'Oxford University Press',
        'Apress',
        'Packt',
      ];
      for (const pub of knownPubs) {
        if (new RegExp(`\\b${pub}\\b`, 'i').test(text)) {
          publisher = pub;
          break;
        }
      }
    }

    // 4. Edition
    let edition = null;
    const editionMatch = text.match(
      /\b((?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+edition)\b/i
    );
    if (editionMatch && editionMatch[1]) {
      edition = editionMatch[1].trim();
    }

    // 5. Language
    let language = null;
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) {
      language = 'ja';
    } else if (text.length > 50) {
      language = 'en';
    }

    // 6. Authors
    const authors =
      book?.author && book.author !== 'Unknown Author'
        ? [book.author]
        : [];

    return {
      publisher,
      publication_year,
      isbn,
      edition,
      authors,
      editors: [],
      copyright_holder,
      language,
      subtitle: null,
      series: null,
      fell_back: true,
      fallback_reason: fallbackReason,
    };
  }
}

module.exports = new BookBibliographer();
