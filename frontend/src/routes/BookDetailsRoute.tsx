import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Layers,
  Circle,
  CheckCircle2,
  FileText,
  AlertCircle,
  RotateCw,
  MoreHorizontal,
  Trash2,
  Plus,
  Send,
} from 'lucide-react';
import { useBook, useBookSummary, useSemanticStatus } from '../hooks/useBook';
import { useChapters } from '../hooks/useChapters';
import { useEditorial } from '../hooks/useEditorial';
import { useModal } from '../store/useModalStore';
import { getCoverTheme, formatReadingTime } from '../components/library/BookCard';
import { EmptyState } from '../components/shared/EmptyState';

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
    isLoading: isChaptersLoading,
    refetch: refetchChapters,
  } = useChapters(bookId);

  const {
    summary,
    refetch: refetchSummary,
  } = useBookSummary(bookId);

  const {
    status: semanticStatus,
    isLoading: isSemanticLoading,
    refetch: refetchSemantic,
  } = useSemanticStatus(bookId);

  const { outline, synthesizedCount } = useEditorial(bookId);

  // Keyboard navigation for roving tabindex in chapter list
  const [focusedChapterIndex, setFocusedChapterIndex] = useState(0);
  const chapterRowRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    chapterRowRefs.current = chapterRowRefs.current.slice(0, chapters.length);
  }, [chapters]);

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
            refetchSummary();
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

  // Reading time calculation: show minutes if < 1h, else ~Xh
  const totalMinutes = Math.max(1, Math.round(wordCount / 200));
  const readingTimeCaption =
    totalMinutes < 60
      ? `~${totalMinutes}m`
      : `~${Math.max(1, Math.round(wordCount / 12000))}h`;

  const firstChapterId = chapters.length > 0 ? chapters[0].id : '';
  const hasChapters = chapters.length > 0;

  // Roving tabindex key handlers
  const handleChapterKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(chapters.length - 1, index + 1);
      setFocusedChapterIndex(next);
      chapterRowRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(0, index - 1);
      setFocusedChapterIndex(prev);
      chapterRowRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedChapterIndex(0);
      chapterRowRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = chapters.length - 1;
      setFocusedChapterIndex(last);
      chapterRowRefs.current[last]?.focus();
    }
  };

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
      <section aria-labelledby="book-hero-title" className="flex flex-col sm:flex-row gap-6 items-start">
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
            <span className="truncate max-w-[80%]">{book.author || 'Unknown Author'}</span>
            <span className="text-accent-wash opacity-80" aria-hidden="true">✦</span>
          </div>
        </div>

        {/* Right Info Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <h1 id="book-hero-title" className="text-display font-semibold text-ink tracking-tight break-words">
            {book.title}
          </h1>
          <p className="text-ui font-medium text-ink-muted">
            {book.author || 'Unknown Author'}
          </p>

          <p className="text-caption text-ink-faint pt-1">
            {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'} · {wordCount.toLocaleString()} words · {readingTimeCaption}
          </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            {(() => {
              const hasSmartContent = Boolean(outline) && synthesizedCount > 0;
              const targetMode = hasSmartContent ? 'smart' : 'original';
              return (
                <button
                  type="button"
                  disabled={!hasChapters}
                  title={!hasChapters ? 'No chapters' : hasSmartContent ? 'Read smart synthesis' : 'Read original text'}
                  onClick={() => navigate(`/read/${book.id}/${firstChapterId}?rep=${targetMode}`)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span>▶</span>
                  <span>Read</span>
                </button>
              );
            })()}

            <button
              type="button"
              disabled={!hasChapters}
              title={!hasChapters ? 'No chapters' : 'Read smart synthesis'}
              onClick={() => navigate(`/read/${book.id}/${firstChapterId}?rep=smart`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-ui-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Layers className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>Smart read</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── SYNOPSIS PANEL ── */}
      <section aria-labelledby="synopsis-heading">
        <div className="rounded-md border border-line bg-card p-5 transition-colors">
          {summary && summary.content ? (
            <div className="space-y-2">
              <span className="text-micro font-bold tracking-wider uppercase text-faint select-none">
                DERIVED · SYNOPSIS
              </span>
              <p className="text-body text-ink leading-relaxed">
                {summary.content.length > 300
                  ? `${summary.content.slice(0, 300)}…`
                  : summary.content}
              </p>
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

      {/* ── TWO-COLUMN BODY (65/35 split at lg+; stacked on mobile) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: CHAPTERS (65% / col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between border-b border-line/60 pb-2">
            <h2 className="text-h2 font-semibold text-ink">Chapters</h2>
            <span className="text-caption text-ink-faint">
              {chapters.length} total
            </span>
          </div>

          {isChaptersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 bg-subtle rounded animate-pulse" />
              ))}
            </div>
          ) : chapters.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={FileText}
                title="No chapters detected"
                body="Add a chapter manually to begin reading."
                action={{
                  label: 'Back to Library',
                  onClick: () => navigate('/'),
                }}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <ol role="list" className="divide-y divide-line/40">
                {chapters.map((ch, idx) => {
                  const readingTime = formatReadingTime(ch.wordCount, 1);
                  const isRead = ch.status === 'read';
                  const isFocused = focusedChapterIndex === idx;

                  return (
                    <li key={ch.id}>
                      <Link
                        ref={(el) => (chapterRowRefs.current[idx] = el)}
                        to={`/read/${book.id}/${ch.id}?rep=original`}
                        tabIndex={isFocused ? 0 : -1}
                        onKeyDown={(e) => handleChapterKeyDown(e, idx)}
                        onFocus={() => setFocusedChapterIndex(idx)}
                        className="group flex items-center justify-between py-2.5 px-3 rounded hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-4">
                          <span className="font-mono text-caption text-faint w-7 text-right shrink-0">
                            {ch.number}.
                          </span>
                          <span className="text-ui-sm text-ink truncate group-hover:text-accent-ink transition-colors font-medium">
                            {ch.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-caption text-ink-muted">
                          <span>{readingTime}</span>
                          {isRead ? (
                            <CheckCircle2
                              className="w-3.5 h-3.5 text-ok stroke-[2]"
                              aria-label="Read"
                            />
                          ) : (
                            <Circle
                              className="w-3.5 h-3.5 text-ink-faint stroke-[1.5]"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>

              {/* Ghost Add Chapter row */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    open('addChapter', {
                      bookId: book.id,
                      nextNumber: chapters.length + 1,
                    })
                  }
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded border border-dashed border-line text-caption text-ink hover:bg-subtle hover:border-line-strong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add chapter</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SEMANTIC INTELLIGENCE (35% / col-span-4) */}
        <div className="lg:col-span-4 space-y-6 lg:pl-2">
          <div className="border-b border-line/60 pb-2">
            <h2 className="text-h2 font-semibold text-ink">Semantic Intelligence</h2>
          </div>

          {/* Indexing status row */}
          <div className="p-3.5 rounded-md border border-line bg-card space-y-1">
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
