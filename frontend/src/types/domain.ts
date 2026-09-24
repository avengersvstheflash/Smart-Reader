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
  type: 'paragraph';
  text: string;
}

export interface HeadingBlock {
  id?: string;
  type: 'heading';
  level: number;
  text: string;
}

export interface QuoteBlock {
  id?: string;
  type: 'quote';
  text: string;
}

export interface ListBlock {
  id?: string;
  type: 'list';
  ordered?: boolean;
  items: (string | CanonicalBlock)[];
}

export interface CodeBlock {
  id?: string;
  type: 'code';
  language?: string;
  text: string;
}

export interface SeparatorBlock {
  id?: string;
  type: 'separator';
}

export interface CalloutBlock {
  id?: string;
  type: 'callout';
  variant?: string;
  title?: string;
  text?: string;
}

export interface TableBlock {
  id?: string;
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
  type: string;             // 'SUMMARY' | 'EDITORIAL_SYNTHESIS' | ...
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

export interface SmartChapter {
  id: string;
  outlineId: string;
  title: string;
  order: number;
  status: 'not-generated' | 'queued' | 'generating' | 'ready' | 'failed';
  progress?: number;
  representationId?: string;
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