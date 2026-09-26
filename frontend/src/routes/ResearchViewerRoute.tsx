import React, { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBook } from '../hooks/useBook';
import { useChapters, useChapter } from '../hooks/useChapters';
import { CanonicalBlock } from '../components/reader/CanonicalBlock';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { apiClient } from '../api/client';
import type { Chapter, CanonicalBlock as CanonicalBlockType } from '../types/domain';

// ---------------------------------------------------------------------------
// ResearchViewerRoute ? Phase 5.3b.1
// Paper-style source viewer. Shows raw canonical blocks (no Smart content).
// Receives optional ?highlight=chk-X, resolves chunk to chapter + sequence.
// Return arrow reads location.state?.returnTo, falls back to /research.
// ---------------------------------------------------------------------------

interface ChapterPanelProps {
  chapterId: string;
  highlightSequence: number | null;
  reducedMotion: boolean;
}

function ChapterPanel({ chapterId, highlightSequence, reducedMotion }: ChapterPanelProps) {
  const { chapter, isLoading, isError } = useChapter(chapterId);
  const didScrollRef = useRef(false);

  // Highlight scroll effect ? fires once per chapter load.
  useEffect(() => {
    if (highlightSequence === null || highlightSequence === undefined || isLoading || isError || !chapter) return;
    if (didScrollRef.current) return;

    // Give the DOM a tick to render, then find the block element.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`block-${highlightSequence}`);

      if (el) {
        el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        el.classList.add('research-block-highlighted');
        didScrollRef.current = true;
      }
      // If not found: no scroll, no throw ? silent per spec.
    });

    return () => cancelAnimationFrame(raf);
  }, [highlightSequence, isLoading, isError, chapter, reducedMotion]);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-4 bg-subtle rounded" style={{ width: `${75 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (isError || !chapter) {
    return (
      <p className="text-sm text-err italic">Failed to load chapter content.</p>
    );
  }

  const blocks: CanonicalBlockType[] = chapter.canonicalBlocks || chapter.canonical_blocks || [];

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-ink-muted italic">No extractable text in this source.</p>
    );
  }

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none research-prose">
      {blocks.map((block, idx) => {
        const blockId = `block-${idx}`;
        return (
          <div
            key={blockId}
            id={blockId}
            className="research-block"
          >
            <CanonicalBlock block={block} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter nav sidebar item
// ---------------------------------------------------------------------------
interface ChapterNavItemProps {
  chapter: Chapter;
  isActive: boolean;
  onClick: () => void;
}

function ChapterNavItem({ chapter, isActive, onClick }: ChapterNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? 'bg-subtle text-ink font-medium'
          : 'text-ink-muted hover:text-ink hover:bg-subtle/60'
      }`}
    >
      <span className="line-clamp-2">{chapter.title || `Chapter ${chapter.number ?? ''}`}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main route
// ---------------------------------------------------------------------------
export default function ResearchViewerRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reducedMotion = useReducedMotion();

  // Return destination: router state first, then /research fallback.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/research';

  // Highlight param: ?highlight=chk-X (a chunk id).
  const highlightParam = searchParams.get('highlight');

  const { book, isLoading: bookLoading, isError: bookError } = useBook(bookId || '');
  const { chapters, isLoading: chaptersLoading } = useChapters(bookId || '');

  // Active chapter state ? default to first chapter once list loads if no highlight
  const [activeChapterId, setActiveChapterId] = React.useState<string | null>(null);
  const [highlightSequence, setHighlightSequence] = React.useState<number | null>(null);

  useEffect(() => {
    if (chapters.length > 0 && !activeChapterId && !highlightParam) {
      setActiveChapterId(chapters[0].id);
    }
  }, [chapters, activeChapterId, highlightParam]);

  // If ?highlight is present, fetch /api/chunks/:highlight via apiClient
  useEffect(() => {
    if (!highlightParam) {
      setHighlightSequence(null);
      return;
    }

    let isMounted = true;
    apiClient<{
      id: string;
      bookId: string;
      chapterId: string | null;
      sequence: number | null;
      textContent: string;
    }>(`/api/chunks/${highlightParam}`)
      .then((chunk) => {
        if (!isMounted) return;
        if (chunk.chapterId) {
          setActiveChapterId(chunk.chapterId);
        } else if (chapters.length > 0 && !activeChapterId) {
          setActiveChapterId(chapters[0].id);
        }
        if (chunk.sequence !== null && chunk.sequence !== undefined) {
          setHighlightSequence(chunk.sequence);
        }
      })
      .catch(() => {
        // If 404 or fails: no highlight, no scroll. Do not throw. Do not scroll to top.
        if (!isMounted) return;
        setHighlightSequence(null);
        if (chapters.length > 0 && !activeChapterId) {
          setActiveChapterId(chapters[0].id);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [highlightParam, chapters, activeChapterId]);

  const handleReturn = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (bookLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 animate-pulse text-ink-muted text-sm">
        Loading source material?
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error / not found
  // -------------------------------------------------------------------------
  if (bookError || !book) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
        <button
          type="button"
          onClick={handleReturn}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <p className="text-sm text-err">
          Failed to load source item.{' '}
          <button
            type="button"
            onClick={handleReturn}
            className="underline hover:no-underline"
          >
            Return
          </button>
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Word / chapter counts for metadata panel
  // -------------------------------------------------------------------------
  const totalWords = book.wordCount ?? 0;
  const chapterCount = chapters.length || book.chapterCount || 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      {/* ----------------------------------------------------------------
          Sticky return bar
      ---------------------------------------------------------------- */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-sm border-b border-line">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleReturn}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors py-1 px-1 rounded"
            aria-label="Return to previous view"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{returnTo.startsWith('/read') ? 'Return to Smart View' : 'Research'}</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Main layout: metadata + chapter nav | content
      ---------------------------------------------------------------- */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* ---- Left sidebar: metadata + chapter list ---- */}
          <aside className="w-56 shrink-0 hidden md:block">
            {/* Metadata panel */}
            <div className="sticky top-16 space-y-4">
              <div className="space-y-1">
                <h1 className="text-base font-semibold text-ink leading-snug line-clamp-4">
                  {book.title}
                </h1>
                {book.author && (
                  <p className="text-sm text-ink-muted">{book.author}</p>
                )}
                {book.sourceSite && (
                  <span className="inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-subtle border border-line text-ink-muted">
                    {book.sourceSite}
                  </span>
                )}
                <p className="text-xs text-ink-light pt-1">
                  {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
                  {totalWords > 0 && ` \u00b7 ${totalWords.toLocaleString()} words`}
                </p>
              </div>

              {/* Chapter navigation */}
              {chaptersLoading ? (
                <div className="space-y-1 animate-pulse">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 bg-subtle rounded" />
                  ))}
                </div>
              ) : (
                <nav aria-label="Chapter list" className="space-y-0.5">
                  {chapters.map((ch) => (
                    <ChapterNavItem
                      key={ch.id}
                      chapter={ch}
                      isActive={ch.id === activeChapterId}
                      onClick={() => setActiveChapterId(ch.id)}
                    />
                  ))}
                </nav>
              )}
            </div>
          </aside>

          {/* ---- Main content area (paper) ---- */}
          <main className="flex-1 min-w-0">
            {/* Mobile metadata strip */}
            <div className="md:hidden mb-6 pb-4 border-b border-line space-y-1">
              <h1 className="text-lg font-semibold text-ink leading-snug">{book.title}</h1>
              {book.author && <p className="text-sm text-ink-muted">{book.author}</p>}
              <p className="text-xs text-ink-light">
                {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
                {totalWords > 0 && ` \u00b7 ${totalWords.toLocaleString()} words`}
              </p>
              {/* Mobile chapter select */}
              {!chaptersLoading && chapters.length > 0 && (
                <select
                  value={activeChapterId ?? ''}
                  onChange={(e) => setActiveChapterId(e.target.value)}
                  className="mt-2 w-full text-sm bg-subtle border border-line rounded px-2 py-1 text-ink"
                  aria-label="Select chapter"
                >
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title || `Chapter ${ch.number ?? ''}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Paper content */}
            <div className="max-w-prose">
              {/* Active chapter title */}
              {activeChapterId && chapters.length > 0 && (() => {
                const active = chapters.find((c) => c.id === activeChapterId);
                return active?.title ? (
                  <h2 className="text-xl font-semibold text-ink mb-6 pb-3 border-b border-line/60">
                    {active.title}
                  </h2>
                ) : null;
              })()}

              {/* Chapter blocks */}
              {activeChapterId ? (
                <ChapterPanel
                  key={activeChapterId}
                  chapterId={activeChapterId}
                  highlightSequence={highlightSequence}
                  reducedMotion={reducedMotion}
                />
              ) : chaptersLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-4 bg-subtle rounded" style={{ width: `${70 + (i % 4) * 8}%` }} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted italic">
                  No extractable text in this source.
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
