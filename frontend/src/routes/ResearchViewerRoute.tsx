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
// ResearchViewerRoute — Phase 5.3b.1 / 5.8.0h.1
// Paper-style source viewer. Shows raw canonical blocks (no Smart content).
// Receives ?highlight=chk-A[,chk-B,chk-C], resolves each chunk to its real
// canonical block IDs (blk-...), and highlights every matching block.
//
// History: pre-5.8.0h this used `chunk.sequence` — which is a semantic-chunk
// counter, NOT a canonical-block render index. Chunk sequence 47 pointed at
// `block-47` which either didn't exist or mapped to unrelated content. The
// fix is to resolve via the chunk's canonical_json block IDs.
// ---------------------------------------------------------------------------

type CanonicalBlockShape = {
  id?: string;
  type?: string;
  blocks?: CanonicalBlockShape[];
};

type ChunkApiResponse = {
  id: string;
  bookId: string;
  chapterId: string | null;
  sequence: number | null;
  textContent: string;
  canonicalBlock?: CanonicalBlockShape | null;
  sourcePage?: number | null;
};

/**
 * 5.8.0h.1: a chunk's canonical_json is polymorphic — either a single block
 * ({ id, type, text }) or a composite ({ type: 'composite', blocks: [...] }).
 * Flatten to a list of block IDs that the Research viewer can match against
 * rendered `data-block-id` attributes.
 */
function extractBlockIds(canonicalBlock?: CanonicalBlockShape | null): string[] {
  if (!canonicalBlock) return [];
  if (canonicalBlock.type === 'composite' && Array.isArray(canonicalBlock.blocks)) {
    return canonicalBlock.blocks
      .map((b) => b?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  if (typeof canonicalBlock.id === 'string' && canonicalBlock.id.length > 0) {
    return [canonicalBlock.id];
  }
  return [];
}

interface ChapterPanelProps {
  chapterId: string;
  // 5.8.0h.1: real canonical block IDs (blk-...), not chunk sequences.
  highlightBlockIds: string[];
  reducedMotion: boolean;
}

function ChapterPanel({ chapterId, highlightBlockIds, reducedMotion }: ChapterPanelProps) {
  const { chapter, isLoading, isError } = useChapter(chapterId);
  const didScrollRef = useRef(false);

  // Highlight scroll effect — fires once per chapter mount.
  useEffect(() => {
    if (!highlightBlockIds || highlightBlockIds.length === 0) return;
    if (isLoading || isError || !chapter) return;
    if (didScrollRef.current) return;

    const raf = requestAnimationFrame(() => {
      let firstEl: HTMLElement | null = null;

      for (const bid of highlightBlockIds) {
        const el = document.querySelector(`[data-block-id="${bid}"]`) as HTMLElement | null;
        if (el) {
          el.classList.add('research-block-highlighted');
          if (!firstEl) firstEl = el;
        }
      }

      if (firstEl) {
        firstEl.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'center',
        });
        didScrollRef.current = true;
      }
      // If nothing matched: silent per spec.
    });

    return () => cancelAnimationFrame(raf);
  }, [highlightBlockIds, isLoading, isError, chapter, reducedMotion]);

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
    <article className="prose prose-reader max-w-none research-prose text-ink">
      {blocks.map((block, idx) => {
        const blockId = `block-${idx}`;
        const realBlockId = (block as { id?: string }).id;
        return (
          <div
            key={blockId}
            id={blockId}
            // 5.8.0h.1: expose the block's real ID so highlight resolution
            // can match on it. Falls back to nothing when the block has no id.
            data-block-id={realBlockId || undefined}
            className="research-block"
          >
            <CanonicalBlock block={block} />
          </div>
        );
      })}
    </article>
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
          ? 'border-l-2 border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent-ink))] font-medium'
          : 'text-[rgb(var(--ink-muted))] hover:text-[rgb(var(--ink))] hover:bg-[rgb(var(--subtle)/0.5)]'
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

  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/research';

  // Highlight param: ?highlight=chk-A or ?highlight=chk-A,chk-B,chk-C
  const highlightParam = searchParams.get('highlight');

  const { book, isLoading: bookLoading, isError: bookError } = useBook(bookId || '');
  const { chapters, isLoading: chaptersLoading } = useChapters(bookId || '');

  const [activeChapterId, setActiveChapterId] = React.useState<string | null>(null);

  // 5.8.0h.1: real canonical block IDs (blk-...) collected from every
  // matching chunk's canonical_json. Empty array = no highlight.
  const [highlightBlockIds, setHighlightBlockIds] = React.useState<string[]>([]);

  useEffect(() => {
    if (chapters.length > 0 && !activeChapterId && !highlightParam) {
      setActiveChapterId(chapters[0].id);
    }
  }, [chapters, activeChapterId, highlightParam]);

  // 5.8.0h.1: resolve chunk IDs → canonical block IDs.
  useEffect(() => {
    if (!highlightParam) {
      setHighlightBlockIds([]);
      return;
    }

    const chunkIds = highlightParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (chunkIds.length === 0) {
      setHighlightBlockIds([]);
      return;
    }

    let isMounted = true;

    Promise.all(
      chunkIds.map((cid) =>
        apiClient<ChunkApiResponse>(`/api/chunks/${cid}`).catch(() => null)
      )
    )
      .then((results) => {
        if (!isMounted) return;

        const valid: ChunkApiResponse[] = results.filter(
          (r): r is ChunkApiResponse => r !== null
        );

        if (valid.length === 0) {
          setHighlightBlockIds([]);
          if (chapters.length > 0 && !activeChapterId) {
            setActiveChapterId(chapters[0].id);
          }
          return;
        }

        const firstWithChapter = valid.find((r) => r.chapterId !== null);
        const firstChapterId = firstWithChapter?.chapterId ?? null;

        if (firstChapterId) {
          setActiveChapterId(firstChapterId);
        } else if (chapters.length > 0 && !activeChapterId) {
          setActiveChapterId(chapters[0].id);
        }

        const targetChapter: string | null = firstChapterId ?? activeChapterId;

        // Collect block IDs from every valid chunk belonging to the target
        // chapter. Chunks without a canonical_json contribute nothing.
        const blockIds: string[] = [];
        const seen = new Set<string>();

        for (const r of valid) {
          if (targetChapter !== null && r.chapterId !== targetChapter) continue;
          for (const bid of extractBlockIds(r.canonicalBlock)) {
            if (!seen.has(bid)) {
              seen.add(bid);
              blockIds.push(bid);
            }
          }
        }

        setHighlightBlockIds(blockIds);
      })
      .catch(() => {
        if (!isMounted) return;
        setHighlightBlockIds([]);
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

  if (bookLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 animate-pulse text-ink-muted text-sm">
        Loading source material…
      </div>
    );
  }

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
          <button type="button" onClick={handleReturn} className="underline hover:no-underline">
            Return
          </button>
        </p>
      </div>
    );
  }

  const totalWords = book.wordCount ?? 0;
  const chapterCount = chapters.length || book.chapterCount || 0;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="sticky top-0 z-10 bg-surface backdrop-blur-sm border-b border-line">
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

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          <aside className="w-56 shrink-0 hidden md:block">
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

          <main className="flex-1 min-w-0">
            <div className="md:hidden mb-6 pb-4 border-b border-line space-y-1">
              <h1 className="text-lg font-semibold text-ink leading-snug">{book.title}</h1>
              {book.author && <p className="text-sm text-ink-muted">{book.author}</p>}
              <p className="text-xs text-ink-light">
                {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
                {totalWords > 0 && ` \u00b7 ${totalWords.toLocaleString()} words`}
              </p>
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

            <div className="max-w-prose">
              {activeChapterId && chapters.length > 0 && (() => {
                const active = chapters.find((c) => c.id === activeChapterId);
                return active?.title ? (
                  <h2 className="text-xl font-semibold text-ink mb-6 pb-3 border-b border-line/60">
                    {active.title}
                  </h2>
                ) : null;
              })()}

              {activeChapterId ? (
                <ChapterPanel
                  key={activeChapterId}
                  chapterId={activeChapterId}
                  highlightBlockIds={highlightBlockIds}
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