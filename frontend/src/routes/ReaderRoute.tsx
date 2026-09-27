import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  RotateCw,
  BookOpen,
  ArrowLeft,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  useSmartChapters,
  useSmartChapter,
  useUpdateSmartChapterProgress,
} from '../hooks/useSmartChapters';
import { apiClient } from '../api/client';
import {
  useEditorial,
  useEditorialProgress,
  useGenerateOutline,
  useSynthesizeNext,
} from '../hooks/useEditorial';
import { useReaderStore } from '../store/useReaderStore';
import { ReaderView } from '../components/reader/ReaderView';
import { ChapterNav } from '../components/reader/ChapterNav';
import { ScrollProgress } from '../components/reader/ScrollProgress';
import { EmptyState } from '../components/shared/EmptyState';
import { useScrollDirection } from '../hooks/useScrollDirection';
import { Chapter, ChapterRepresentation, CanonicalBlock } from '../types/domain';

function ReaderSkeleton() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 animate-pulse space-y-6" aria-busy="true">
      <div className="h-4 bg-subtle rounded w-28 mb-4" />
      <div className="h-9 bg-subtle rounded w-3/4 mb-6" />
      <div className="h-3 bg-subtle rounded w-40 mb-8" />
      <div className="space-y-4">
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-11/12" />
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-4/5" />
      </div>
      <div className="space-y-4">
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-10/12" />
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-3/4" />
      </div>
    </div>
  );
}

/** Status view for Smart chapters that are not yet generated */
function SmartChapterStatus({
  status,
  title,
  sequence,
  bookId,
  onGenerate,
  busy,
}: {
  status: 'pending' | 'generating' | 'failed';
  title: string | null;
  sequence: number;
  bookId: string;
  onGenerate: (count: number) => void;
  busy: boolean;
}) {
  if (status === 'generating' || busy) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-h2 font-semibold text-ink">
          {title || `Chapter ${sequence}`}
        </h2>
        <p className="text-body text-ink-muted">
          Synthesizing Smart chapter content with citations and provenance…
        </p>
        <Link
          to={`/book/${bookId}`}
          className="inline-flex items-center gap-1.5 text-caption text-accent-ink hover:underline pt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Book Details</span>
        </Link>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-err mx-auto" />
        <h2 className="text-h2 font-semibold text-ink">
          {title || `Chapter ${sequence}`}
        </h2>
        <p className="text-body text-ink-muted">
          Generation failed for this chapter. You can retry generating it.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerate(1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry Synthesis</span>
          </button>
          <Link
            to={`/book/${bookId}`}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Book Details</span>
          </Link>
        </div>
      </div>
    );
  }

  // pending
  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
      <Clock className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
      <h2 className="text-h2 font-semibold text-ink">
        {title || `Chapter ${sequence}`}
      </h2>
      <p className="text-body text-ink-muted">
        This Smart chapter is queued and has not been synthesized yet.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onGenerate(1)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Synthesize this chapter</span>
        </button>
        <Link
          to={`/book/${bookId}`}
          className="inline-flex items-center gap-1.5 text-caption text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Book Details</span>
        </Link>
      </div>
    </div>
  );
}

export default function ReaderRoute() {
  const { bookId = '', chapterId = '' } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();

  // Smart chapters for the book
  const {
    chapters: smartChapters,
    isLoading: isSmartListLoading,
    isError: isSmartListError,
    error: smartListError,
    refetch: refetchSmartList,
  } = useSmartChapters(bookId);

  // Active smart chapter content — chapterId is the smart chapter ID
  const {
    smartChapter,
    isLoading: isSmartChapterLoading,
    isError: isSmartChapterError,
    error: smartChapterError,
    refetch: refetchSmartChapter,
  } = useSmartChapter(chapterId);

  const {
    outline,
    chapterCount: outlineChapterCount,
    synthesizedCount,
    refetch: refetchEditorial,
  } = useEditorial(bookId);

  const updateProgress = useUpdateSmartChapterProgress(bookId);

  const fontSize = useReaderStore((state) => state.fontSize);
  const align = useReaderStore((state) => state.align);

  const { direction, isAtTop } = useScrollDirection();
  const navVisible = direction === 'up' || isAtTop;

  const smartStatus = smartChapter?.status;
  const isGenerated = smartStatus === 'generated';

  // 3a. Record opened_at on mount of a generated smart chapter (fire-and-forget)
  const hasFiredOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isGenerated && smartChapter && hasFiredOpenedRef.current !== smartChapter.id) {
      hasFiredOpenedRef.current = smartChapter.id;
      apiClient(`/api/smart-chapters/${smartChapter.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ status: 'opened' }),
      }).catch((err) => {
        console.error('[ReaderRoute] Failed to record chapter opened:', err);
      });
    }
  }, [isGenerated, smartChapter?.id]);

  // 3b. IntersectionObserver on the last CanonicalBlock container
  const hasFiredReadRef = useRef<boolean>(false);

  useEffect(() => {
    hasFiredReadRef.current = Boolean(smartChapter?.readAt);
  }, [chapterId, smartChapter?.readAt]);

  useEffect(() => {
    if (!isGenerated || !smartChapter || smartChapter.readAt || hasFiredReadRef.current) {
      return;
    }

    const targetEl = document.querySelector('[data-last-canonical-block="true"]');
    if (!targetEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
            if (window.scrollY > 200 && !hasFiredReadRef.current) {
              hasFiredReadRef.current = true;
              observer.disconnect();
              updateProgress.mutate({
                smartChapterId: chapterId,
                status: 'read',
                source: 'scroll',
              });
            }
          }
        }
      },
      { threshold: 0.8 }
    );

    observer.observe(targetEl);

    return () => {
      observer.disconnect();
    };
  }, [isGenerated, smartChapter?.id, smartChapter?.readAt, chapterId, updateProgress]);

  // Restore scroll position when entering Smart mode if previously saved
  useEffect(() => {
    if (chapterId) {
      const scrollKey = `smart_scroll_${chapterId}`;
      const savedScroll = sessionStorage.getItem(scrollKey);
      if (savedScroll) {
        const y = Number(savedScroll);
        if (y > 0) {
          const timer = setTimeout(() => {
            window.scrollTo({ top: y, behavior: 'auto' });
            sessionStorage.removeItem(scrollKey);
          }, 80);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [chapterId]);

  const handleNavigateToSource = (chunkId: string) => {
    const scrollKey = `smart_scroll_${chapterId}`;
    sessionStorage.setItem(scrollKey, String(window.scrollY));

    navigate(`/research/${bookId}?highlight=${chunkId}`, {
      state: { returnTo: `/read/${bookId}/${chapterId}` },
    });
  };

  const hasOutline = Boolean(outline);

  const [generating, setGenerating] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);

  useEffect(() => {
    if (!generating) return;
    const t = setTimeout(() => {
      console.warn('[Editorial] generating flag held > 5min, clearing');
      setGenerating(false);
    }, 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [generating]);

  const generateOutline = useGenerateOutline(bookId);
  const synthesizeNext = useSynthesizeNext(bookId);

  const {
    synthesized: progressSynthesized,
    total: progressTotal,
  } = useEditorialProgress(bookId, generating);

  const remaining = Math.max(0, (outlineChapterCount ?? 0) - (synthesizedCount ?? 0));

  const handleBeginSmartReading = async () => {
    if (generating) return;
    try {
      setGenerating(true);
      await generateOutline.mutateAsync();
      await synthesizeNext.mutateAsync({ count: 3 });
    } catch (err) {
      console.error('[Editorial] generation failed', err);
    } finally {
      setGenerating(false);
      setBatchTotal(0);
      refetchSmartChapter();
      refetchSmartList();
      refetchEditorial();
    }
  };

  const handleGenerate = async (count: number) => {
    if (generating) return;
    try {
      setGenerating(true);
      setBatchTotal(count);
      await synthesizeNext.mutateAsync({ count });
    } catch (err) {
      console.error('[Editorial] synthesize failed', err);
    } finally {
      setGenerating(false);
      setBatchTotal(0);
      refetchSmartChapter();
      refetchSmartList();
      refetchEditorial();
    }
  };

  const isLoading = isSmartListLoading || isSmartChapterLoading;
  const isError = isSmartListError || isSmartChapterError;
  const error = smartChapterError || smartListError;

  const handleNavigate = (newChapterId: string) => {
    navigate(`/read/${bookId}/${newChapterId}`);
  };

  // Keyboard navigation across smart chapters
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        const idx = smartChapters.findIndex((c) => c.id === chapterId);
        if (idx > 0) {
          e.preventDefault();
          handleNavigate(smartChapters[idx - 1].id);
        }
      } else if (e.key === 'ArrowRight') {
        const idx = smartChapters.findIndex((c) => c.id === chapterId);
        if (idx !== -1 && idx < smartChapters.length - 1) {
          e.preventDefault();
          handleNavigate(smartChapters[idx + 1].id);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [smartChapters, chapterId, bookId]);

  if (isError) {
    return (
      <div className="rounded-md border border-err/30 bg-err/10 p-6 text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-err mx-auto mb-2" aria-hidden="true" />
        <h3 className="text-ui font-semibold text-ink mb-1">Failed to load chapter</h3>
        <p className="text-caption text-ink-muted mb-4">
          {error?.message || 'An error occurred while loading this chapter.'}
        </p>
        <button
          type="button"
          onClick={() => {
            refetchSmartList();
            refetchSmartChapter();
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (!isLoading && smartChapters.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No smart chapters available"
        body="This book has no Smart chapters generated yet."
        action={{
          label: 'Back to Book Details',
          onClick: () => navigate(`/book/${bookId}`),
        }}
      />
    );
  }

  // Canonical blocks from metadata
  const canonicalBlocksFromMeta = (
    (smartChapter?.metadata as Record<string, unknown> | null)?.canonicalBlocks as CanonicalBlock[] | undefined
  ) ?? [];

  // Adapt smart chapter into Chapter and ChapterRepresentation for ReaderView
  const chapterForReader: Chapter | null = smartChapter
    ? {
        id: smartChapter.id,
        number: smartChapter.sequence,
        title: smartChapter.title || `Chapter ${smartChapter.sequence}`,
        wordCount: smartChapter.plannedWordCount || 0,
        status: 'read',
        bookId: smartChapter.bookId,
        content: smartChapter.content || '',
      }
    : null;

  const repForReader: ChapterRepresentation | null = smartChapter
    ? {
        id: smartChapter.id,
        book_id: smartChapter.bookId,
        type: 'SMART_CHAPTER',
        content: smartChapter.content || '',
        metadata: {
          ...(smartChapter.metadata ?? {}),
          canonicalBlocks: canonicalBlocksFromMeta,
        },
        created_at: smartChapter.createdAt,
      }
    : null;

  const reallyRemaining = isGenerated
    ? remaining
    : Math.max(remaining, 1);

  return (
    <div className="relative min-h-screen flex flex-col justify-between">
      {/* Scroll Progress Indicator */}
      <ScrollProgress />

      {/* Main Reading Canvas */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-24">
        {/* Top bar with Back Link and Mark as read */}
        <div className="flex items-center justify-between py-2 mb-6 border-b border-line/60">
          <button
            type="button"
            onClick={() => navigate(`/book/${bookId}`)}
            className="inline-flex items-center gap-1 text-caption text-ink-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Book details</span>
          </button>

          {isGenerated && smartChapter && (
            <button
              type="button"
              disabled={updateProgress.isPending}
              title={smartChapter.readAt ? 'Click to mark unread' : 'Mark as read'}
              onClick={() => {
                if (smartChapter.readAt) {
                  hasFiredReadRef.current = false;
                  updateProgress.mutate({
                    smartChapterId: smartChapter.id,
                    status: 'unread',
                  });
                } else {
                  hasFiredReadRef.current = true;
                  updateProgress.mutate({
                    smartChapterId: smartChapter.id,
                    status: 'read',
                    source: 'button',
                  });
                }
              }}
              className={
                smartChapter.readAt
                  ? 'inline-flex items-center gap-1 px-3 py-1 text-caption font-medium rounded-md border border-line/50 bg-subtle/50 text-ink-muted hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
                  : 'inline-flex items-center gap-1.5 px-3 py-1 text-caption font-medium rounded-md border border-line bg-surface text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
              }
            >
              <span>{smartChapter.readAt ? '✓ Read' : 'Mark as read'}</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        {isLoading || !chapterForReader ? (
          <ReaderSkeleton />
        ) : !isGenerated && smartStatus ? (
          <SmartChapterStatus
            status={smartStatus as 'pending' | 'generating' | 'failed'}
            title={smartChapter.title}
            sequence={smartChapter.sequence}
            bookId={bookId}
            onGenerate={handleGenerate}
            busy={generating}
          />
        ) : (
          <ReaderView
            chapter={chapterForReader}
            representation={repForReader}
            mode="smart"
            fontSize={fontSize}
            align={align}
            onNavigateToSource={handleNavigateToSource}
            provenanceRepId={smartChapter?.id ?? null}
            smartState={{
              hasOutline,
              remaining: reallyRemaining,
              busy: generating,
              progress:
                generating && progressTotal > 0
                  ? {
                      synthesized: progressSynthesized,
                      total: batchTotal > 0 ? Math.min(progressTotal, synthesizedCount + batchTotal) : progressTotal,
                    }
                  : null,
              onGenerate: handleGenerate,
              onBeginSmartReading: handleBeginSmartReading,
            }}
          />
        )}
      </div>

      {/* Chapter Navigation Bar */}
      {smartChapters.length > 0 && (
        <div
          className={`sticky bottom-0 z-20 w-full transition-transform duration-200 ease-out motion-reduce:transition-none ${
            navVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <ChapterNav
            chapters={smartChapters.map((sc) => ({
              id: sc.id,
              number: sc.sequence,
              title: sc.title || `Chapter ${sc.sequence}`,
              status: sc.status,
            }))}
            currentId={chapterId}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  );
}
