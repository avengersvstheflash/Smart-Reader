export type Theme = 'default' | 'warm' | 'dark' | 'glass';
export type RepMode = 'original' | 'smart';
export type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Job {
  id: string;
  bookId: string;
  chapterId?: string | null;
  type: string;
  status: string;
  progress: number;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface RawJob {
  id: string;
  book_id?: string | null;
  bookId?: string | null;
  chapter_id?: string | null;
  chapterId?: string | null;
  type: string;
  status: string;
  progress?: number | null;
  error?: string | null;
  started_at?: string;
  startedAt?: string;
  completed_at?: string | null;
  completedAt?: string | null;
}

export function normalizeJob(raw: RawJob): Job {
  return {
    id: raw.id,
    bookId: raw.bookId || raw.book_id || '',
    chapterId: raw.chapterId || raw.chapter_id || null,
    type: raw.type,
    status: raw.status,
    progress: typeof raw.progress === 'number' ? raw.progress : 0,
    error: raw.error || null,
    startedAt: raw.startedAt || raw.started_at || '',
    completedAt: raw.completedAt || raw.completed_at || null,
  };
}

export interface BookClassification {
  contentType: string;
  tags: string[];
  readingLevel?: 'introductory' | 'intermediate' | 'advanced' | 'research' | string;
  targetAudience?: string;
  prerequisites?: string[];
  toolsCovered?: string[];
  fell_back?: boolean;
  classifiedAt?: string;
}

export interface BookBibliographic {
  publisher?: string | null;
  publication_year?: number | null;
  publicationYear?: number | null;
  isbn?: string | null;
  edition?: string | null;
  authors?: string[];
  editors?: string[];
  copyright_holder?: string | null;
  copyrightHolder?: string | null;
  language?: string | null;
  subtitle?: string | null;
  series?: string | null;
  fell_back?: boolean;
  fallback_reason?: string;
  extractedAt?: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  description?: string;
  contentType: string;
  chapterCount: number;
  readChapterCount?: number;
  wordCount?: number;
  integrityStatus?: 'ok' | 'valid' | 'empty_content';
  coverPath?: string;
  sourceFormat?: string;
  sourceSite?: string;
  sourceUrl?: string;
  hasSmartContent?: boolean;
  classification?: BookClassification;
  bibliographic?: BookBibliographic;
  aiProvider?: string;
}

export interface RawBook {
  id: string;
  title: string;
  author?: string;
  description?: string;
  content_type?: string;
  contentType?: string;
  chapter_count?: number;
  chapterCount?: number;
  read_chapter_count?: number;
  readChapterCount?: number;
  total_words?: number;
  wordCount?: number;
  integrity_status?: 'ok' | 'valid' | 'empty_content';
  integrityStatus?: 'ok' | 'valid' | 'empty_content';
  cover_path?: string;
  coverPath?: string;
  source_format?: string;
  sourceFormat?: string;
  source_site?: string;
  sourceSite?: string;
  source_url?: string;
  sourceUrl?: string;
  has_smart_content?: boolean;
  hasSmartContent?: boolean;
  ai_provider?: string;
  aiProvider?: string;
  metadata_json?: string | { classification?: BookClassification; bibliographic?: BookBibliographic; [key: string]: unknown };
  metadata?: { classification?: BookClassification; bibliographic?: BookBibliographic; [key: string]: unknown };
  classification?: BookClassification;
  bibliographic?: BookBibliographic;
}

export function normalizeBook(raw: RawBook): Book {
  let classification: BookClassification | undefined;
  let bibliographic: BookBibliographic | undefined;

  if (raw.classification) {
    classification = raw.classification;
  }
  if (raw.bibliographic) {
    bibliographic = raw.bibliographic;
  }

  if (raw.metadata_json) {
    try {
      const parsed = typeof raw.metadata_json === 'string' ? JSON.parse(raw.metadata_json) : raw.metadata_json;
      if (parsed) {
        if (!classification && parsed.classification) {
          classification = parsed.classification;
        }
        if (!bibliographic && parsed.bibliographic) {
          bibliographic = parsed.bibliographic;
        }
      }
    } catch {}
  }

  if (raw.metadata) {
    const meta = raw.metadata as Record<string, unknown>;
    if (!classification && meta.classification) {
      classification = meta.classification as BookClassification;
    }
    if (!bibliographic && meta.bibliographic) {
      bibliographic = meta.bibliographic as BookBibliographic;
    }
  }

  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    author: raw.author || 'Unknown Author',
    description: raw.description || '',
    contentType: raw.contentType || raw.content_type || 'novel',
    chapterCount: raw.chapterCount ?? raw.chapter_count ?? 0,
    readChapterCount: raw.readChapterCount ?? raw.read_chapter_count ?? 0,
    wordCount: raw.wordCount ?? raw.total_words ?? 0,
    integrityStatus: raw.integrityStatus || (raw.integrity_status === 'empty_content' ? 'empty_content' : 'ok'),
    coverPath: raw.coverPath || raw.cover_path,
    sourceFormat: raw.sourceFormat || raw.source_format,
    sourceSite: raw.sourceSite || raw.source_site,
    sourceUrl: raw.sourceUrl || raw.source_url,
    hasSmartContent: Boolean(raw.hasSmartContent ?? raw.has_smart_content ?? false),
    classification,
    bibliographic,
    aiProvider: raw.aiProvider || raw.ai_provider,
  };
}

export type CanonicalBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'list'
  | 'code'
  | 'separator'
  | 'callout'
  | 'table';

export interface ParagraphBlock {
  id?: string;
  sourcePage?: number;
  type: 'paragraph';
  text: string;
}

export interface HeadingBlock {
  id?: string;
  sourcePage?: number;
  type: 'heading';
  level: number;
  text: string;
}

export interface QuoteBlock {
  id?: string;
  sourcePage?: number;
  type: 'quote';
  text: string;
}

export interface ListBlock {
  id?: string;
  sourcePage?: number;
  type: 'list';
  ordered?: boolean;
  items: (string | CanonicalBlock)[];
}

export interface CodeBlock {
  id?: string;
  sourcePage?: number;
  type: 'code';
  language?: string;
  text: string;
}

export interface SeparatorBlock {
  id?: string;
  sourcePage?: number;
  type: 'separator';
}

export interface CalloutBlock {
  id?: string;
  sourcePage?: number;
  type: 'callout';
  variant?: string;
  title?: string;
  text?: string;
}

export interface TableBlock {
  id?: string;
  sourcePage?: number;
  type: 'table';
  caption?: string;
  headers?: string[];
  rows?: string[][];
  alignments?: ('left' | 'center' | 'right')[];
}

export type CanonicalBlock =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | ListBlock
  | CodeBlock
  | SeparatorBlock
  | CalloutBlock
  | TableBlock;

export interface Chapter {
  id: string;
  number: number;
  title: string;
  wordCount: number;
  status: 'unread' | 'reading' | 'read';
  bookId?: string;
  content?: string;
  canonical_content?: string | CanonicalBlock[];
  canonicalBlocks?: CanonicalBlock[];
  canonical_blocks?: CanonicalBlock[];
  structuralRole?: string;
}

export interface RawChapter {
  id: string;
  book_id?: string;
  bookId?: string;
  number: number;
  title: string;
  word_count?: number;
  wordCount?: number;
  status?: 'unread' | 'reading' | 'read' | string;
  content?: string;
  canonical_content?: string | CanonicalBlock[];
  canonicalContent?: string | CanonicalBlock[];
  canonical_blocks?: CanonicalBlock[];
  canonicalBlocks?: CanonicalBlock[];
  structural_role?: string;
  structuralRole?: string;
  has_summary?: number | boolean;
}

export function normalizeChapter(raw: RawChapter): Chapter {
  let parsedCanonical: CanonicalBlock[] | undefined = undefined;

  if (Array.isArray(raw.canonicalBlocks)) {
    parsedCanonical = raw.canonicalBlocks;
  } else if (Array.isArray(raw.canonical_blocks)) {
    parsedCanonical = raw.canonical_blocks;
  } else if (typeof raw.canonical_content === 'string') {
    try {
      const parsed = JSON.parse(raw.canonical_content);
      if (Array.isArray(parsed)) {
        parsedCanonical = parsed as CanonicalBlock[];
      }
    } catch {
      parsedCanonical = undefined;
    }
  } else if (Array.isArray(raw.canonical_content)) {
    parsedCanonical = raw.canonical_content;
  }

  const rawStatus = raw.status;
  const status: 'unread' | 'reading' | 'read' =
    rawStatus === 'reading' || rawStatus === 'read' ? rawStatus : 'unread';

  return {
    id: raw.id,
    bookId: raw.bookId || raw.book_id,
    number: raw.number,
    title: raw.title || `Chapter ${raw.number}`,
    wordCount: raw.wordCount ?? raw.word_count ?? 0,
    status,
    content: raw.content,
    canonical_content: parsedCanonical || raw.canonical_content,
    canonicalBlocks: parsedCanonical || [],
    canonical_blocks: parsedCanonical || [],
    structuralRole: raw.structuralRole || raw.structural_role,
  };
}

export interface RepresentationMetadata {
  canonicalBlocks?: CanonicalBlock[];
  provenance?: ProvenanceRef[];
  provider?: string;
  model?: string;
  fell_back?: boolean;
  duplicate?: boolean;
  fallback_reason?: string;
  [key: string]: unknown;
}

export interface ChapterRepresentation {
  id: string;
  chapter_id?: string;
  chapterId?: string;
  book_id: string;
  bookId?: string;
  type: string;             // 'SUMMARY' | 'BOOK_SUMMARY' | ...
  content: string;
  metadata_json?: string;   // raw JSON from DB
  metadata?: RepresentationMetadata;  // parsed if available
  created_at?: string;
  createdAt?: string;
}

export function parseRepresentationMetadata(rep: ChapterRepresentation): RepresentationMetadata {
  if (rep.metadata && typeof rep.metadata === 'object') return rep.metadata;
  if (typeof rep.metadata_json === 'string') {
    try {
      const parsed = JSON.parse(rep.metadata_json);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* fall through */ }
  }
  return {};
}

export interface ProvenanceRef {
  chunkId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle?: string;
  sectionHeading?: string;
  blockStart: number;
  blockEnd: number;
}

export interface ProvenanceSegment {
  sentence_start: number;
  sentence_end: number;
  chunk_id: string;
  confidence: number;
}

export interface ParagraphAttribution {
  paragraph_index: number;
  segments: ProvenanceSegment[];
  source_chunk_ids: string[];
  weights: Record<string, number>;
  method: string;
  confidence: string;
  grounded: boolean;
}

export interface SegmentRun {
  runIndex: number;
  sentenceStart: number;
  sentenceEnd: number;
  chunkId: string;
  confidence: number;
}

/**
 * Abbreviations that end with a period but are NOT sentence boundaries.
 * Phase 5.5e: covers academic prose, citations, and common Latin abbreviations.
 */
const ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'fig.', 'eq.', 'no.',
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'approx.', 'ca.', 'al.',
  'ch.', 'sec.', 'vol.', 'ed.', 'eds.', 'pp.', 'p.', 'op.', 'cit.',
  'ibid.', 'et.', 'dept.', 'est.', 'inc.', 'corp.', 'ltd.', 'co.',
  'jan.', 'feb.', 'mar.', 'apr.', 'jun.', 'jul.', 'aug.', 'sep.',
  'oct.', 'nov.', 'dec.',
]);

/**
 * Split paragraph text into sentences, preserving sentence boundary punctuation.
 * Phase 5.5e: abbreviation-aware — "e.g.", "i.e.", "etc.", initials, and
 * lowercase-following periods are NOT treated as sentence boundaries.
 * Matches backend provenanceResolver.splitIntoSentences contract.
 *
 * Contract: concatenating all returned sentences reproduces the original text
 * exactly (each sentence retains its trailing whitespace from the source).
 */
export function splitIntoSentences(text?: string | null): string[] {
  const t = (text || '').trim();
  if (!t) return [];

  // Strip inline [Source N] citation markers before splitting.
  const cleaned = t
    .replace(/\s*\[Source\s+\d+\]/gi, '')
    .trim();

  if (!cleaned) return [t];

  const result: string[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    // Only candidate boundaries: . ! ?
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Consume trailing punctuation cluster (e.g. "..." or "!?")
    let boundaryEnd = i;
    while (boundaryEnd + 1 < cleaned.length && /[.!?]/.test(cleaned[boundaryEnd + 1])) {
      boundaryEnd++;
    }

    // Consume optional closing quote/paren
    let afterBoundary = boundaryEnd + 1;
    if (afterBoundary < cleaned.length && /["'\)\]]/.test(cleaned[afterBoundary])) {
      afterBoundary++;
    }

    // If at end of string, this is the final sentence — emit and stop.
    if (afterBoundary >= cleaned.length) {
      const sent = cleaned.slice(sentenceStart).trim();
      if (sent) result.push(sent);
      sentenceStart = cleaned.length;
      break;
    }

    // What follows the boundary?
    const afterChar = cleaned[afterBoundary];

    // Rule A: if followed by lowercase → NOT a boundary (sentence continuation).
    // Handles "e. g. argument" and similar spacing artifacts.
    if (/[a-z]/.test(afterChar)) {
      i = boundaryEnd;
      continue;
    }

    // Rule B: if the terminal is '.', check abbreviations and initials.
    if (ch === '.') {
      // Find the token immediately before this '.': walk back to previous space or start.
      let tokenEnd = i; // exclusive: the '.' itself is not in the token
      let tokenStart = tokenEnd - 1;
      while (tokenStart > sentenceStart && cleaned[tokenStart - 1] !== ' ') {
        tokenStart--;
      }
      const token = cleaned.slice(tokenStart, tokenEnd).toLowerCase() + '.';

      // Is it a known abbreviation?
      if (ABBREVIATIONS.has(token)) {
        i = boundaryEnd;
        continue;
      }

      // Is it a single-letter initial (e.g. "J. K. Rowling")?
      if (/^[a-z]\.$/.test(token)) {
        i = boundaryEnd;
        continue;
      }
    }

    // Rule C: must be followed by whitespace then an uppercase letter (or digit for new sentence).
    if (!/\s/.test(afterChar)) {
      i = boundaryEnd;
      continue;
    }

    // Find first non-space char after boundary
    let nextWordStart = afterBoundary;
    while (nextWordStart < cleaned.length && /\s/.test(cleaned[nextWordStart])) {
      nextWordStart++;
    }

    if (nextWordStart >= cleaned.length) {
      // Trailing whitespace — emit final sentence
      const sent = cleaned.slice(sentenceStart, afterBoundary).trim();
      if (sent) result.push(sent);
      sentenceStart = cleaned.length;
      i = boundaryEnd;
      continue;
    }

    const nextCh = cleaned[nextWordStart];

    // Only split if next word starts uppercase or a digit (new sentence heuristic).
    if (!/[A-Z0-9"'([]/.test(nextCh)) {
      i = boundaryEnd;
      continue;
    }

    // Emit this sentence (up to and including boundary punctuation, no trailing space).
    const sent = cleaned.slice(sentenceStart, afterBoundary).trim();
    if (sent) result.push(sent);
    sentenceStart = nextWordStart;
    i = boundaryEnd;
  }

  // Emit any remainder
  if (sentenceStart < cleaned.length) {
    const sent = cleaned.slice(sentenceStart).trim();
    if (sent) result.push(sent);
  }

  return result.length > 0 ? result : [cleaned];
}

/**
 * Group consecutive segments sharing the same chunk_id into a single run.
 * Example: [s1->chkA, s2->chkA, s3->chkB, s4->chkA] -> 3 runs.
 */
export function groupSegmentsIntoRuns(segments?: ProvenanceSegment[]): SegmentRun[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const runs: SegmentRun[] = [];

  for (const seg of segments) {
    if (!seg.chunk_id) continue;
    const chunkId = String(seg.chunk_id).trim();
    if (!chunkId) continue;

    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.chunkId === chunkId) {
      lastRun.sentenceEnd = Math.max(lastRun.sentenceEnd, seg.sentence_end);
      lastRun.confidence = Math.max(lastRun.confidence, seg.confidence);
    } else {
      runs.push({
        runIndex: runs.length,
        sentenceStart: seg.sentence_start,
        sentenceEnd: seg.sentence_end,
        chunkId,
        confidence: seg.confidence,
      });
    }
  }

  return runs;
}

export interface ProvenanceChunk {
  id: string;
  chapter_id?: string | null;
  sequence?: number | null;
  section_heading: string | null;
  source_page: number | null;
  excerpt: string;
  block_ids: string[];
}

export interface ProvenanceData {
  representation_id: string;
  verified_at: string | null;
  paragraphs: ParagraphAttribution[];
  chunks?: Record<string, ProvenanceChunk>;
}

export interface SmartChapter {
  id: string;
  bookId: string;
  sequence: number;
  title: string | null;
  status: 'pending' | 'generating' | 'generated' | 'failed';
  plannedWordCount: number | null;
  content: string | null;
  synthesisType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  readAt: string | null;
  readSource: 'scroll' | 'button' | null;
}

export interface BookSummary {
  content: string;
}

export interface BookSynopsis {
  content: string;
  fellBack?: boolean;
  fallbackReason?: string;
}

export interface SemanticStatus {
  chunkCount: number;
  dimensions?: number;
  status?: string;
}

