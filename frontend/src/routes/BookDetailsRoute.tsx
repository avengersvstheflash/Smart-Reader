import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  AlertCircle,
  RotateCw,
  MoreHorizontal,
  Trash2,
  Plus,
  Send,
} from 'lucide-react';
import { useBook, useBookSynopsis, useSemanticStatus } from '../hooks/useBook';
import { useChapters } from '../hooks/useChapters';
import { useSmartChapters, useResumeTarget } from '../hooks/useSmartChapters';
import { formatRelativeTime } from '../lib/relativeTime';
import { useModal } from '../store/useModalStore';
import { getCoverTheme } from '../components/library/BookCard';
import { ExpandableTagPanel } from '../components/library/ExpandableTagPanel';
import { formatAuthorList } from '../types/domain';
import { renderInlineText } from '../components/reader/CanonicalBlock';

function formatAiProvider(raw?: string): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'openrouter') return 'OpenRouter';
  if (lower === 'ollama') return 'Ollama (local)';
  if (lower === 'gemini') return 'Gemini';
  return null;
}

function BookDetailsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between py-2 border-b border-line/60">
        <div className="h-4 bg-subtle rounded w-24" />
        <div className="h-8 bg-subtle rounded w-8" />
      </div>

      {/* Hero skeleton: cover block + 3 lines + buttons */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-[140px] h-[187px] bg-subtle rounded-md shrink-0 shadow-sm" />
        <div className="flex-1 space-y-3 w-full">
          <div className="h-8 bg-subtle rounded w-3/4" />
          <div className="h-4 bg-subtle rounded w-1/3" />
          <div className="h-3 bg-subtle rounded w-1/2" />
          <div className="flex gap-3 pt-4">
            <div className="h-9 bg-subtle rounded w-28" />
            <div className="h-9 bg-subtle rounded w-36" />
          </div>
        </div>
      </div>

      {/* Synopsis panel skeleton */}
      <div className="rounded-md border border-line bg-card p-5 space-y-2">
        <div className="h-3 bg-subtle rounded w-28" />
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-5/6" />
      </div>

      {/* Two column body skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
        <div className="lg:col-span-8 space-y-3">
          <div className="h-6 bg-subtle rounded w-32 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-subtle rounded w-full" />
          ))}
        </div>
        <div className="lg:col-span-4 space-y-4">
          <div className="h-6 bg-subtle rounded w-40 mb-4" />
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
            <div className="h-4 bg-subtle rounded w-48" />
          </div>
          <div className="h-24 bg-subtle rounded w-full" />
        </div>
      </div>
    </div>
  );
}

export default function BookDetailsRoute() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { open } = useModal();

  const {
    book,
    isLoading: isBookLoading,
    isError: isBookError,
    error: bookError,
    refetch: refetchBook,
  } = useBook(bookId);

  const {
    chapters,
    refetch: refetchChapters,
  } = useChapters(bookId);

  const {
    chapters: smartChapters,
    total: smartTotal,
    generated: smartGenerated,
    isLoading: isSmartChaptersLoading,
    refetch: refetchSmartChapters,
  } = useSmartChapters(bookId);

  const {
    synopsis,
    refetch: refetchSynopsis,
  } = useBookSynopsis(bookId);

  const {
    status: semanticStatus,
    isLoading: isSemanticLoading,
    refetch: refetchSemantic,
  } = useSemanticStatus(bookId);

  const { resumeTarget } = useResumeTarget(bookId);

  const providerLabel = formatAiProvider(book?.aiProvider);

  // Loading state
  if (isBookLoading) {
    return <BookDetailsSkeleton />;
  }

  // Error state: full region replacement
  if (isBookError) {
    return (
      <div className="rounded-md border border-err/30 bg-err/10 p-6 text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-err mx-auto mb-2" aria-hidden="true" />
        <h3 className="text-ui font-semibold text-ink mb-1">Failed to load book</h3>
        <p className="text-caption text-ink-muted mb-4">
          {bookError?.message || 'An error occurred while connecting to the server.'}
        </p>
        <button
          type="button"
          onClick={() => {
            refetchBook();
            refetchChapters();
            refetchSmartChapters();
            refetchSynopsis();
            refetchSemantic();
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // 404 / Not Found state
  if (!book) {
    return (
      <div className="rounded-md border border-line bg-card p-8 text-center max-w-md mx-auto my-12 shadow-sm">
        <BookOpen className="w-10 h-10 text-ink-muted mx-auto mb-3 opacity-60" aria-hidden="true" />
        <h2 className="text-h2 font-semibold text-ink mb-2">Book Not Found</h2>
        <p className="text-caption text-ink-muted mb-6">
          This book couldn't be found or may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Library</span>
        </button>
      </div>
    );
  }

  // Cover spine theme
  const theme = getCoverTheme(book.title + book.id);
  const wordCount = book.wordCount && book.wordCount > 0 ? book.wordCount : chapters.reduce((acc, c) => acc + (c.wordCount || 0), 0);
  const chapterCount = book.chapterCount > 0 ? book.chapterCount : chapters.length;

  // Omni reading time: sum of generated smart chapter word counts
   const omniWordCount = smartChapters
    .filter((sc) => sc.status === 'generated')
    .reduce((acc, sc) => acc + (sc.wordCount || 0), 0);
   const omniMinutes = Math.max(1, Math.round(omniWordCount / 200));
  const omniReadingCaption =
    smartTotal > 0 &&
    smartGenerated === smartTotal &&
    omniWordCount > 0
      ? omniMinutes < 60
        ? `~${omniMinutes} min Omni read`
        : `~${(omniMinutes / 60).toFixed(1)}h Omni read`
      : null;


  // Navigate to first generated Smart chapter or resume target
  const firstGeneratedSmartChapter = smartChapters.find((sc) => sc.status === 'generated');
  const firstSmartChapterId = firstGeneratedSmartChapter?.id ?? '';
  const hasSmartChapters = Boolean(firstSmartChapterId);

  const resumeSmartChapterId = resumeTarget?.smartChapterId;
  const targetChapterId = resumeSmartChapterId || firstSmartChapterId;
  const isResuming = Boolean(resumeSmartChapterId && resumeTarget?.sequence);
  const readButtonLabel = isResuming
    ? `Continue: Chapter ${resumeTarget?.sequence}`
    : hasSmartChapters
    ? 'Start reading'
    : 'Read';

  const readCount = smartChapters.filter((sc) => Boolean(sc.readAt)).length;

  return (
    <div className="space-y-8 pb-16">
      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between py-2 border-b border-line/60">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-caption text-ink-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1 py-0.5"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Library</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Menu button placeholder (Phase 3.5 modal system) */}
          <button
            type="button"
            disabled
            title="Available in a later phase"
            className="p-1.5 rounded-md text-ink-muted border border-transparent hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Book actions menu"
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── HERO ── */}
      <section aria-labelledby="book-hero-title" className="rounded-lg border border-line bg-card p-6 shadow-sm flex flex-col sm:flex-row gap-6 items-start">
        {/* Cover Block (3:4 aspect, size ~140x187) */}
        <div
          className="relative w-[140px] h-[187px] rounded-md overflow-hidden shadow-inner flex flex-col justify-between p-3 text-white select-none shrink-0"
          style={{ aspectRatio: '3/4' }}
        >
          <div
            className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`}
            aria-hidden="true"
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-2.5 opacity-90 shadow"
            style={{ backgroundColor: theme.spine }}
            aria-hidden="true"
          />
          <div
            className="absolute left-2.5 top-0 bottom-0 w-px bg-white/20"
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-center justify-between pl-2">
            <BookOpen className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
            <span className="text-[9px] uppercase tracking-wider font-semibold px-1 py-0.2 rounded bg-black/30 backdrop-blur-sm">
              {book.contentType}
            </span>
          </div>

          <div className="relative z-10 my-auto pl-2">
            <p className="font-display text-sm font-semibold line-clamp-3 leading-snug drop-shadow-sm">
              {book.title}
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-between pl-2 text-[10px] opacity-90 font-medium">
            <span className="truncate max-w-[80%]">{formatAuthorList(book.bibliographic?.authors, book.author)}</span>
            <span className="text-accent-wash opacity-80" aria-hidden="true">✦</span>
          </div>
        </div>

        {/* Right Info Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <h1 id="book-hero-title" className="text-display font-semibold text-ink tracking-tight break-words">
            {book.title}
          </h1>
          <p className="text-ui font-medium text-ink-muted">
            {formatAuthorList(book.bibliographic?.authors, book.author)}
          </p>

          {/* Classification Chips Row */}
          {book.classification && (
            <div className="space-y-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-2" aria-label="Book classification">
                {book.classification.contentType && (
                  <span className="text-micro uppercase font-semibold px-2.5 py-0.5 rounded-md bg-brand/10 text-brand tracking-wider select-none">
                    {book.classification.contentType}
                  </span>
                )}
                {book.classification.readingLevel && (
                  <span className="text-caption font-medium px-2.5 py-0.5 rounded-md bg-subtle text-ink-muted capitalize select-none">
                    {book.classification.readingLevel}
                  </span>
                )}
              </div>
              {Array.isArray(book.classification.tags) && book.classification.tags.length > 0 && (
                <ExpandableTagPanel
                  tags={book.classification.tags}
                  interactive={false}
                />
              )}
            </div>
          )}

           <p className="text-caption text-ink-faint pt-1">
             {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'} · {wordCount.toLocaleString()} source words
             {omniReadingCaption ? ` · ${omniReadingCaption}` : ''}
           </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              disabled={!hasSmartChapters}
              title={
                !hasSmartChapters
                  ? 'No Omni chapters generated yet'
                  : isResuming
                  ? `Continue reading from Chapter ${resumeTarget?.sequence}`
                  : 'Start reading from Chapter 1'
              }
              onClick={() => navigate(`/read/${book.id}/${targetChapterId}`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>▶</span>
              <span>{readButtonLabel}</span>
            </button>

            <button
              type="button"
              title="View original source in Research"
              onClick={() => navigate(`/research/${book.id}`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-ui-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-subtle transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FileText className="w-4 h-4 text-muted" aria-hidden="true" />
              <span>View original</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── SYNOPSIS PANEL ── */}
      <section aria-labelledby="synopsis-heading">
        <div className="rounded-lg border border-line bg-card p-6 shadow-xs hover:border-line-strong transition-colors">
          {synopsis && synopsis.content ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span id="synopsis-heading" className="text-micro font-semibold tracking-wider uppercase text-accent-ink select-none">
                  DERIVED · SYNOPSIS
                </span>
                {synopsis.fellBack === true && (
                  <span className="text-micro font-medium text-ink-muted/70 select-none">
                    Model unavailable
                  </span>
                )}
              </div>
              {synopsis.fellBack === true && (
                <p className="text-caption text-ink-muted mt-0 mb-1">
                  Structured synopsis — model unavailable. This synopsis was not generated by the AI.
                </p>
              )}
              <div className="space-y-3 pt-0.5">
                {(synopsis.canonicalBlocks && synopsis.canonicalBlocks.length > 0
                  ? synopsis.canonicalBlocks
                      .map((b) => (b.type === 'paragraph' ? b.text : ('text' in b ? String(b.text) : '')))
                      .filter((t): t is string => Boolean(t && t.trim()))
                  : synopsis.content
                      .split(/\r?\n\s*\r?\n/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                ).map((para, idx) => (
                  <p key={idx} className="text-body text-ink leading-relaxed m-0">
                    {renderInlineText(para)}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-caption text-ink-muted">
              <div>
                <p className="font-medium text-ink">No synopsis yet.</p>
                <p className="text-caption text-ink-faint">
                  An editorial summary can be generated for this work.
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Available in a later phase"
                className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-medium rounded-md border border-line bg-subtle text-ink-muted disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
              >
                Generate synopsis
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── BIBLIOGRAPHIC PANEL ── */}
      {(() => {
        const biblio = book.bibliographic;
        if (!biblio) return null;

        const pubYear = biblio.publication_year ?? biblio.publicationYear;
        const hasAuthors = Array.isArray(biblio.authors) && biblio.authors.length > 0;
        const hasFields = Boolean(
          hasAuthors ||
          biblio.publisher ||
          pubYear ||
          biblio.isbn ||
          biblio.edition ||
          biblio.language
        );

        if (!hasFields) return null;

        return (
          <section aria-labelledby="bibliographic-heading">
            <div className="rounded-lg border border-line bg-card p-6 shadow-xs hover:border-line-strong transition-colors space-y-3">
              <div className="flex items-center justify-between">
                <span id="bibliographic-heading" className="text-micro font-semibold tracking-wider uppercase text-ink-muted select-none">
                  SOURCE · BIBLIOGRAPHY
                </span>
                {biblio.fell_back && (
                  <span className="text-micro font-medium text-ink-muted/70 select-none">
                    Heuristic fallback
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5" aria-label="Bibliographic details">
                {hasAuthors && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">
                      {(biblio.authors?.length ?? 0) > 1 ? 'Authors' : 'Author'}
                    </span>
                    <span>{formatAuthorList(biblio.authors)}</span>
                  </span>
                )}
                {biblio.publisher && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">Publisher</span>
                    <span>{biblio.publisher}</span>
                  </span>
                )}
                {pubYear && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">Year</span>
                    <span>{pubYear}</span>
                  </span>
                )}
                {biblio.isbn && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">ISBN</span>
                    <span className="font-mono text-ui-sm">{biblio.isbn}</span>
                  </span>
                )}
                {biblio.edition && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">Edition</span>
                    <span>{biblio.edition}</span>
                  </span>
                )}
                {biblio.language && (
                  <span className="inline-flex items-center gap-1.5 text-caption font-medium px-2.5 py-1 rounded bg-subtle text-ink">
                    <span className="text-micro font-semibold uppercase text-ink-muted/80 tracking-wider">Language</span>
                    <span className="uppercase font-semibold">{biblio.language}</span>
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── TWO-COLUMN BODY (65/35 split at lg+; stacked on mobile) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: SMART CHAPTERS (65% / col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between border-b border-line/60 pb-2">
            <h2 className="text-h2 font-semibold text-ink">Omni Chapters</h2>
            <span className="text-caption text-ink-faint">
              {smartGenerated} of {smartTotal} generated{readCount > 0 ? ` · ${readCount} read` : ''}
            </span>
          </div>

          {isSmartChaptersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 bg-subtle rounded animate-pulse" />
              ))}
            </div>
          ) : smartChapters.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-caption text-ink-muted">No Omni chapters yet.</p>
              <p className="text-micro text-ink-faint mt-1">They will appear here once synthesis begins.</p>
            </div>
          ) : (
            <ol role="list" className="divide-y divide-line/40">
              {smartChapters.map((sc) => {
                const isGenerated = sc.status === 'generated';
                const isGenerating = sc.status === 'generating';
                const isPending = sc.status === 'pending';
                const isFailed = sc.status === 'failed';

                const badge = isGenerating ? (
                  <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent-ink animate-pulse">
                    Generating…
                  </span>
                ) : isPending ? (
                  <span className="text-micro font-medium px-2 py-0.5 rounded-full bg-subtle text-ink-muted">
                    Queued
                  </span>
                ) : isFailed ? (
                  <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-err/10 text-err">
                    Failed
                  </span>
                ) : null;

                const readIndicator = sc.readAt ? (
                  <span className="text-micro text-ink-faint shrink-0">
                    Read {formatRelativeTime(sc.readAt)}
                  </span>
                ) : sc.openedAt ? (
                  <span className="text-micro text-ink-faint shrink-0">
                    Opened {formatRelativeTime(sc.openedAt)}
                  </span>
                ) : null;

                const rowContent = (
                  <>
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                      <span className="font-mono text-caption text-faint w-7 text-right shrink-0">
                        {sc.sequence}.
                      </span>
                      <span
                        className={`text-ui-sm truncate font-medium flex-1 min-w-0 ${
                          isGenerated
                            ? 'text-ink group-hover:text-accent-ink transition-colors'
                            : 'text-ink-muted'
                        }`}
                      >
                        {sc.title ?? `Chapter ${sc.sequence}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {readIndicator}
                      {badge}
                    </div>
                  </>
                );

                return (
                  <li key={sc.id}>
                    {isGenerated ? (
                      <Link
                        to={`/read/${book.id}/${sc.id}`}
                        className="group flex items-center justify-between py-2.5 px-3 rounded hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {rowContent}
                      </Link>
                    ) : (
                      <div
                        className="flex items-center justify-between py-2.5 px-3 rounded opacity-60 cursor-not-allowed"
                        title={
                          isPending
                            ? 'Not yet generated'
                            : isGenerating
                            ? 'Generating…'
                            : 'Generation failed'
                        }
                      >
                        {rowContent}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* RIGHT COLUMN: SEMANTIC INTELLIGENCE (35% / col-span-4) */}
        <div className="lg:col-span-4 space-y-6 lg:pl-2">
          <div className="border-b border-line/60 pb-2">
            <h2 className="text-h2 font-semibold text-ink">Semantic Intelligence</h2>
          </div>

          {/* Indexing status row */}
          <div className="p-4 rounded-lg border border-line bg-card shadow-xs hover:border-line-strong transition-colors space-y-1.5">
            <div className="flex items-center gap-2 text-ui-sm">
              {isSemanticLoading ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                  <span className="text-ink-muted text-caption">Checking semantic index…</span>
                </>
              ) : semanticStatus && semanticStatus.chunkCount > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
                  <span className="font-medium text-ink">
                    Indexed: {semanticStatus.chunkCount.toLocaleString()} chunks
                  </span>
                  <span className="text-caption text-ok font-medium">● ready</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-warn shrink-0" aria-hidden="true" />
                  <span className="font-medium text-ink">Not indexed</span>
                </>
              )}
            </div>
            {providerLabel && (
              <div>
                <span
                  className="text-caption text-ink-muted"
                  title="Source text is sent to the configured provider for compression. Configure Ollama in .env for fully local mode."
                >
                  Provider: {providerLabel}
                </span>
              </div>
            )}
            {(!semanticStatus || semanticStatus.chunkCount === 0) && !isSemanticLoading && (
              <p className="text-caption text-ink-faint">
                Vector chunking is pending or unindexed for this book.
              </p>
            )}
          </div>

          {/* Ask this book form (disabled) */}
          <div className="space-y-1.5">
            <label htmlFor="ask-book-input" className="block text-ui-sm font-medium text-ink">
              Ask this book…
            </label>
            <div className="relative">
              <textarea
                id="ask-book-input"
                disabled
                rows={3}
                placeholder="Ask questions about themes, characters, or specific chapters…"
                className="w-full text-ui-sm rounded-md border border-line bg-subtle/50 p-2.5 text-ink-muted placeholder:text-ink-faint resize-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled
                title="Available in a later phase"
                className="absolute bottom-2.5 right-2.5 p-1 rounded bg-subtle text-ink-faint disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send query"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-micro text-ink-faint">Available in a later phase</p>
          </div>

          {/* Supporting materials */}
          <div className="space-y-2 pt-2 border-t border-line/40">
            <h3 className="text-ui-sm font-semibold text-ink">Supporting materials</h3>
            <button
              type="button"
              disabled
              title="Available in a later phase"
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded border border-dashed border-line text-caption text-ink-faint disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attach source</span>
            </button>
            <p className="text-micro text-ink-faint text-center">Available in a later phase</p>
          </div>

          {/* Danger zone */}
          <div className="pt-4 border-t border-line/40">
            <button
              type="button"
              onClick={() =>
                open('deleteBook', {
                  bookId: book.id,
                  bookTitle: book.title,
                  chapterCount: chapters.length,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium rounded border border-err/30 text-err bg-err/5 hover:bg-err/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-err"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Delete book</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
