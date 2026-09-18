import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  BookOpenText,
  Layers,
  AlertCircle,
  RotateCw,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import { useChapters, useChapter } from '../hooks/useChapters';
import { useReaderStore } from '../store/useReaderStore';
import { ReaderView } from '../components/reader/ReaderView';
import { ChapterNav } from '../components/reader/ChapterNav';
import { ScrollProgress } from '../components/reader/ScrollProgress';
import { EmptyState } from '../components/shared/EmptyState';
import { useScrollDirection } from '../hooks/useScrollDirection';

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
      <div className="space-y-4">
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-5/6" />
      </div>
    </div>
  );
}

export default function ReaderRoute() {
  const { bookId = '', chapterId = '' } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawRep = searchParams.get('rep');
  const repInUrl: 'original' | 'smart' | null =
    rawRep === 'original' || rawRep === 'smart' ? rawRep : null;

  const storedMode = useReaderStore((state) =>
    bookId ? state.getMode(bookId) : 'original'
  );
  const setStoredMode = useReaderStore((state) => state.setMode);
  const fontSize = useReaderStore((state) => state.fontSize);
  const align = useReaderStore((state) => state.align);

  const mode: 'original' | 'smart' = repInUrl ?? storedMode ?? 'original';

  const { direction, isAtTop } = useScrollDirection();
  const navVisible = direction === 'up' || isAtTop;

  useEffect(() => {
    if (!bookId) return;

    if (repInUrl) {
      if (storedMode !== repInUrl) {
        setStoredMode(bookId, repInUrl);
      }
    } else {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('rep', mode);
          return next;
        },
        { replace: true }
      );
    }
  }, [bookId, repInUrl, storedMode, mode, setSearchParams, setStoredMode]);

  const handleModeChange = (newMode: 'original' | 'smart') => {
    if (bookId) {
      setStoredMode(bookId, newMode);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('rep', newMode);
      return next;
    });
  };

  const {
    chapters,
    isLoading: isChaptersLoading,
    isError: isChaptersError,
    error: chaptersError,
    refetch: refetchChapters,
  } = useChapters(bookId);

  const {
    chapter,
    representations,
    isLoading: isChapterLoading,
    isError: isChapterError,
    error: chapterError,
    refetch: refetchChapter,
  } = useChapter(chapterId);

  const activeRepresentation = useMemo(() => {
    if (!representations || representations.length === 0) return null;
    // Prefer EDITORIAL_SYNTHESIS, fall back to SUMMARY
    const editorial = representations.find((r) => r.type === 'EDITORIAL_SYNTHESIS');
    const summary = representations.find((r) => r.type === 'SUMMARY');
    return editorial ?? summary ?? representations[0];
  }, [representations]);

  const isLoading = isChaptersLoading || isChapterLoading;
  const isError = isChaptersError || isChapterError;
  const error = chapterError || chaptersError;

  const handleNavigate = (newChapterId: string) => {
    navigate(`/read/${bookId}/${newChapterId}?rep=${mode}`);
  };

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

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleModeChange(mode === 'original' ? 'smart' : 'original');
      } else if (e.key === 'ArrowLeft') {
        const idx = chapters.findIndex((c) => c.id === chapterId);
        if (idx > 0) {
          e.preventDefault();
          handleNavigate(chapters[idx - 1].id);
        }
      } else if (e.key === 'ArrowRight') {
        const idx = chapters.findIndex((c) => c.id === chapterId);
        if (idx !== -1 && idx < chapters.length - 1) {
          e.preventDefault();
          handleNavigate(chapters[idx + 1].id);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, chapters, chapterId, bookId]);

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
            refetchChapters();
            refetchChapter();
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (!isLoading && chapters.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No chapters available"
        body="This book has no chapters or content available for reading."
        action={{
          label: 'Back to Book Details',
          onClick: () => navigate(`/book/${bookId}`),
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-between">
      {/* Scroll Progress Indicator */}
      <ScrollProgress />

      {/* Main Reading Canvas */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-24">
        {/* Top bar with Back Link and Mode Toggle */}
        <div className="flex items-center justify-between py-2 mb-6 border-b border-line/60">
          <button
            type="button"
            onClick={() => navigate(`/book/${bookId}`)}
            className="inline-flex items-center gap-1 text-caption text-ink-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Book details</span>
          </button>

          {/* Mode Toggle Control */}
          <div
            role="radiogroup"
            aria-label="Reading representation"
            className="inline-flex items-center rounded-full border border-line bg-subtle p-0.5 select-none"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'original'}
              onClick={() => handleModeChange('original')}
              className={`inline-flex items-center px-3 py-1 text-ui-sm font-medium rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                mode === 'original'
                  ? 'bg-surface shadow-sm text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <BookOpenText className="w-4 h-4 mr-1.5" aria-hidden="true" />
              <span>Original</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'smart'}
              onClick={() => handleModeChange('smart')}
              className={`inline-flex items-center px-3 py-1 text-ui-sm font-medium rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                mode === 'smart'
                  ? 'bg-surface shadow-sm text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Layers className="w-4 h-4 mr-1.5" aria-hidden="true" />
              <span>Smart</span>
            </button>
          </div>
        </div>

        {/* Content Area: Skeleton while loading, or ReaderView */}
        {isLoading || !chapter ? (
          <ReaderSkeleton />
        ) : (
          <ReaderView
            chapter={chapter}
            representation={activeRepresentation}
            mode={mode}
            fontSize={fontSize}
            align={align}
          />
        )}
      </div>

      {/* Chapter Navigation Bar */}
      {chapters.length > 0 && (
        <div
          className={`sticky bottom-0 z-20 w-full transition-transform duration-200 ease-out motion-reduce:transition-none ${
            navVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <ChapterNav
            chapters={chapters}
            currentId={chapterId}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  );
}
