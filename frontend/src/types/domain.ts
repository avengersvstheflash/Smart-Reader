export type Theme = 'spring' | 'sakura' | 'coffee' | 'cyberpunk' | 'omni';
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

export type ImportTaskType = 'file' | 'paste' | 'web' | 'web_multi';
export type ImportTaskStatus = 'queued' | 'initializing' | 'processing' | 'finalizing' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ImportStageKey = 'preparing' | 'acquiring' | 'extracting' | 'structuring' | 'indexing' | 'synthesizing' | 'ready';

export interface ImportTaskStage {
  stage: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ImportTask {
  id: string;
  type: ImportTaskType;
  sourceTitle: string;
  sourceMeta: Record<string, any>;
  status: ImportTaskStatus;
  stage: ImportStageKey;
  stageLabel: string;
  progress: number;
  queueOrder: number;
  bookId?: string | null;
  error?: string | null;
  stages?: ImportTaskStage[];
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface RawImportTask {
  id: string;
  type: string;
  source_title?: string;
  sourceTitle?: string;
  source_meta?: Record<string, any> | string;
  sourceMeta?: Record<string, any>;
  status: string;
  stage?: string;
  stage_label?: string;
  stageLabel?: string;
  progress?: number;
  queue_order?: number;
  queueOrder?: number;
  book_id?: string | null;
  bookId?: string | null;
  error?: string | null;
  stages?: ImportTaskStage[];
  stages_json?: ImportTaskStage[] | string;
  created_at?: string;
  createdAt?: string;
  started_at?: string | null;
  startedAt?: string | null;
  completed_at?: string | null;
  completedAt?: string | null;
}

export function normalizeImportTask(raw: RawImportTask): ImportTask {
  let meta: Record<string, any> = {};
  const rawMeta = raw.sourceMeta || raw.source_meta;
  if (typeof rawMeta === 'string') {
    try {
      meta = JSON.parse(rawMeta);
    } catch {
      meta = {};
    }
  } else if (rawMeta && typeof rawMeta === 'object') {
    meta = rawMeta;
  }

  let stages: ImportTaskStage[] = [];
  if (Array.isArray(raw.stages)) {
    stages = raw.stages;
  } else if (Array.isArray(raw.stages_json)) {
    stages = raw.stages_json;
  } else if (typeof raw.stages_json === 'string') {
    try {
      stages = JSON.parse(raw.stages_json);
    } catch {
      stages = [];
    }
  }

  return {
    id: raw.id,
    type: (raw.type as ImportTaskType) || 'file',
    sourceTitle: raw.sourceTitle || raw.source_title || 'Untitled Import',
    sourceMeta: meta,
    status: (raw.status as ImportTaskStatus) || 'queued',
    stage: (raw.stage as ImportStageKey) || 'preparing',
    stageLabel: raw.stageLabel || raw.stage_label || 'Queued for processing',
    progress: typeof raw.progress === 'number' ? raw.progress : 0,
    queueOrder: typeof (raw.queueOrder ?? raw.queue_order) === 'number' ? (raw.queueOrder ?? raw.queue_order)! : 0,
    bookId: raw.bookId || raw.book_id || null,
    error: raw.error || null,
    stages,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    startedAt: raw.startedAt || raw.started_at || null,
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
  metadata?: Record<string, unknown>;
  aiProvider?: string;
  createdAt?: string;
  importStartedAt?: string | null;
  importCompletedAt?: string | null;
  synthesisCompletedAt?: string | null;
  attributionCompletedAt?: string | null;
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
  created_at?: string;
  createdAt?: string;
  import_started_at?: string | null;
  importStartedAt?: string | null;
  import_completed_at?: string | null;
  importCompletedAt?: string | null;
  synthesis_completed_at?: string | null;
  synthesisCompletedAt?: string | null;
  attribution_completed_at?: string | null;
  attributionCompletedAt?: string | null;
}

export function formatAuthorList(authors?: string[] | null, fallback: string = 'Unknown Author'): string {
  if (!authors || !Array.isArray(authors) || authors.length === 0) {
    return fallback;
  }
  const clean = authors.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean);
  if (clean.length === 0) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
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

  const rawAuthor = raw.author?.trim();
  const effectiveAuthor = (bibliographic?.authors && bibliographic.authors.length > 0)
    ? formatAuthorList(bibliographic.authors, rawAuthor || 'Unknown Author')
    : (rawAuthor || 'Unknown Author');

  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    author: effectiveAuthor,
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
    metadata: (raw.metadata as Record<string, unknown>) || (typeof raw.metadata_json === 'object' ? raw.metadata_json as Record<string, unknown> : undefined),
    aiProvider: raw.aiProvider || raw.ai_provider,
    createdAt: raw.createdAt || raw.created_at || undefined,
    importStartedAt: raw.importStartedAt || raw.import_started_at || null,
    importCompletedAt: raw.importCompletedAt || raw.import_completed_at || null,
    synthesisCompletedAt: raw.synthesisCompletedAt || raw.synthesis_completed_at || null,
    attributionCompletedAt: raw.attributionCompletedAt || raw.attribution_completed_at || null,
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

export interface ParagraphSentence {
  text: string;
  start: number;
  end: number;
}

export interface ParagraphBlock {
  id?: string;
  sourcePage?: number;
  type: 'paragraph';
  text: string;
  sentences?: ParagraphSentence[];
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
  chunk_ids?: string[];
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
  chunkIds: string[];
  confidence: number;
}

/**
 * Split paragraph text into sentences, preserving sentence boundary punctuation.
 * Phase 5.5e.1: Correct splitter over-clumping regression. Handles strong abbreviations,
 * initials, and boundary punctuation without swallowing sentence-ending single-letter variables
 * (e.g. math clauses) or terminal abbreviations (e.g. etc.).
 * Matches backend provenanceResolver.splitIntoSentences contract.
 */
export function splitIntoSentences(text?: string | null): string[] {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/\s*\[Source\s+\d+\]/gi, '').trim();
  if (!cleaned) return [];

  const STRONG_ABBREVIATIONS = new Set([
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'sr.', 'jr.',
    'e.g.', 'i.e.', 'vs.', 'cf.', 'fig.', 'eq.', 'no.', 'ch.', 'sec.', 'vol.',
    'approx.', 'ca.', 'dept.', 'est.', 'inc.', 'corp.', 'ltd.', 'co.'
  ]);

  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    let j = i + 1;
    while (j < cleaned.length && /[.!?]/.test(cleaned[j])) j++;

    if (j >= cleaned.length) break;
    if (!/\s/.test(cleaned[j])) { i = j - 1; continue; }

    let k = j;
    while (k < cleaned.length && /\s/.test(cleaned[k])) k++;
    if (k >= cleaned.length) break;

    const next = cleaned[k];
    if (!/[A-Z0-9"'([]/.test(next)) { i = j - 1; continue; }

    const before = cleaned.slice(0, i);
    const lastSpace = Math.max(
      before.lastIndexOf(' '),
      before.lastIndexOf('\n'),
      before.lastIndexOf('\t')
    );
    const token = (lastSpace >= 0 ? before.slice(lastSpace + 1) : before).toLowerCase();

    if (STRONG_ABBREVIATIONS.has(token + '.')) { i = j - 1; continue; }

    if (/^[a-z]$/.test(token)) {
      const prev = lastSpace >= 0 ? before.slice(0, lastSpace).trim() : '';
      const prevWord = (prev.split(/\s+/).pop() || '').toLowerCase();
      const isPrevInitial = /^[a-z]\.$/.test(prevWord) && !STRONG_ABBREVIATIONS.has(prevWord);
      const isNextInitial = /^[A-Z]\./.test(cleaned.slice(k));

      if (isPrevInitial || isNextInitial) {
        i = j - 1;
        continue;
      }
    }

    out.push(cleaned.slice(start, j).trim());
    start = k;
    i = k - 1;
  }
  const tail = cleaned.slice(start).trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : [cleaned];
}

/**
 * Group consecutive segments sharing the same chunk_id into a single run.
 * Example: [s1->chkA, s2->chkA, s3->chkB, s4->chkA] -> 3 runs.
 */
export function groupSegmentsIntoRuns(segments?: ProvenanceSegment[]): SegmentRun[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const runs: SegmentRun[] = [];

  for (const seg of segments) {
    const rawChunkIds = Array.isArray(seg.chunk_ids) && seg.chunk_ids.length > 0
      ? seg.chunk_ids
      : (seg.chunk_id ? [seg.chunk_id] : []);
    const cleanChunkIds = rawChunkIds.map((c) => String(c).trim()).filter(Boolean);
    if (cleanChunkIds.length === 0) continue;

    const primaryChunkId = String(seg.chunk_id || cleanChunkIds[0]).trim();
    const compositeKey = [...cleanChunkIds].sort().join(',');

    const lastRun = runs[runs.length - 1];
    const lastKey = lastRun ? [...lastRun.chunkIds].sort().join(',') : null;

    if (lastRun && lastKey === compositeKey) {
      lastRun.sentenceEnd = Math.max(lastRun.sentenceEnd, seg.sentence_end);
      lastRun.confidence = Math.max(lastRun.confidence, seg.confidence);
    } else {
      runs.push({
        runIndex: runs.length,
        sentenceStart: seg.sentence_start,
        sentenceEnd: seg.sentence_end,
        chunkId: primaryChunkId,
        chunkIds: cleanChunkIds,
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
  wordCount: number | null;
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
  canonicalBlocks?: CanonicalBlock[];
  llmFlaggedPartial?: boolean;
}

export interface SemanticStatus {
  chunkCount: number;
  dimensions?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// F52: Lifecycle State Coordination & LLM Token/Cost Types
// ---------------------------------------------------------------------------

export type LifecycleState = 'active' | 'library_only' | 'research_only' | 'archived';

export interface BookLifecycle {
  id: string;
  book_id: string;
  in_library: number;
  in_research: number;
  source_preserved: number;
  lifecycle_state: LifecycleState;
  deleted_at: string | null;
  deleted_reason: string | null;
  deleted_from: string | null;
  last_read_chapter_id: string | null;
  last_read_sequence: number | null;
  last_read_title: string | null;
  last_read_scroll_pct: number | null;
  last_read_at: string | null;
  re_synthesis_source_id: string | null;
  synthesis_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReadingProgressSnapshot {
  last_read_sequence: number | null;
  last_read_title: string | null;
  last_read_scroll_pct: number | null;
  last_read_at: string | null;
}

export interface ChapterRenameEntry {
  id: string;
  lifecycle_id: string;
  book_id: string;
  chapter_sequence: number;
  old_title: string | null;
  new_title: string;
  rename_source: string;
  synthesis_cycle: number;
  created_at: string;
}

export interface SynopsisVersionEntry {
  version: number;
  word_count: number;
  created_at: string;
  generator_type: string;
  model_used?: string | null;
}

export interface DossierAppendEntry {
  id: string;
  dossier_id: string;
  book_id: string | null;
  source_id: string;
  source_type: string;
  file_name: string | null;
  file_hash: string | null;
  file_size: number | null;
  source_url: string | null;
  char_count: number;
  word_count: number;
  appended_at: string;
  metadata_json?: string;
}

export interface LlmUsageByStage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  calls: number;
}

export interface BookLlmUsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  by_stage?: Record<string, LlmUsageByStage | null>;
}

export interface BookLifecycleDetails {
  lifecycle: BookLifecycle;
  reading: ReadingProgressSnapshot;
  chapter_history: ChapterRenameEntry[];
  synopsis_versions: SynopsisVersionEntry[];
  append_log: DossierAppendEntry[];
  usage_summary: BookLlmUsageSummary;
}

export interface LlmUsageSummary {
  total_cost_usd: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_provider: Record<string, {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
    calls: number;
  }>;
  by_stage: Record<string, {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
    calls: number;
  }>;
  by_book: Array<{
    book_id: string;
    title: string;
    total_cost_usd: number;
    total_tokens: number;
  }>;
}


