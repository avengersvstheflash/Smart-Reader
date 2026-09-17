export type Theme = 'default' | 'warm' | 'dark' | 'glass';
export type RepMode = 'original' | 'smart';
export type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

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
}

export function normalizeBook(raw: RawBook): Book {
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
  };
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  wordCount: number;
  status: 'unread' | 'reading' | 'read';
}

export interface CanonicalBlock {
  type: 'paragraph' | 'heading' | 'quote' | 'list' | 'code' | 'separator' | 'callout' | 'table';
  [key: string]: unknown;
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