import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, ChevronDown, RotateCw } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useEditorialProgress } from '../../hooks/useEditorial';

export interface ChapterSynthesisButtonProps {
  bookId: string;
  generatedCount: number;
  totalCount: number;
  isSynthesizing?: boolean;
  onComplete?: () => void;
}

// Track endpoint preference: once 404 on /synthesize-next is observed, remember to use /editorial/synthesize-next
let prefersEditorialEndpoint = false;

async function postSynthesizeNext(bookId: string, count: number) {
  if (prefersEditorialEndpoint) {
    return apiClient<{ success: boolean; synthesizedCount?: number }>(
      `/api/books/${bookId}/editorial/synthesize-next`,
      {
        method: 'POST',
        body: JSON.stringify({ count }),
      }
    );
  }
  try {
    return await apiClient<{ success: boolean; synthesizedCount?: number }>(
      `/api/books/${bookId}/synthesize-next`,
      {
        method: 'POST',
        body: JSON.stringify({ count }),
      }
    );
  } catch (err: any) {
    if (err?.status === 404 || err?.message?.includes('404')) {
      prefersEditorialEndpoint = true;
    }
    return apiClient<{ success: boolean; synthesizedCount?: number }>(
      `/api/books/${bookId}/editorial/synthesize-next`,
      {
        method: 'POST',
        body: JSON.stringify({ count }),
      }
    );
  }
}

// Decompose arbitrary chapter counts into valid backend chunks [10, 5, 3, 1]
function decomposeBatches(total: number): number[] {
  const batches: number[] = [];
  let rem = total;
  while (rem > 0) {
    if (rem >= 10) {
      batches.push(10);
      rem -= 10;
    } else if (rem >= 5) {
      batches.push(5);
      rem -= 5;
    } else if (rem >= 3) {
      batches.push(3);
      rem -= 3;
    } else {
      batches.push(1);
      rem -= 1;
    }
  }
  return batches;
}

export const ChapterSynthesisButton: React.FC<ChapterSynthesisButtonProps> = ({
  bookId,
  generatedCount,
  totalCount,
  isSynthesizing = false,
  onComplete,
}) => {
  const queryClient = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [inFlightTarget, setInFlightTarget] = useState<number | null>(null);
  const [initialGenerated, setInitialGenerated] = useState<number>(generatedCount);
  const [toast, setToast] = useState<string | null>(null);

  // Poll progress while local mutation or parent is synthesizing
  const isPendingLocal = inFlightTarget !== null;
  const isSynthesizingActive = isSynthesizing || isPendingLocal;
  const { synthesized: liveSynthesized } = useEditorialProgress(bookId, isSynthesizingActive);

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const remainingCount = Math.max(0, totalCount - generatedCount);
  const primaryCount = Math.min(3, remainingCount > 0 ? remainingCount : 3);

  // Mutation to trigger sequential synthesis
  const synthesizeMutation = useMutation<
    { success: boolean; synthesizedCount?: number; [key: string]: unknown },
    Error,
    number
  >({
    mutationFn: async (targetCount: number) => {
      // Backend validates count against [1, 3, 5, 10].
      // Decompose targetCount into supported batch chunks to safely fulfill arbitrary counts like "All remaining".
      const batches = [1, 3, 5, 10].includes(targetCount)
        ? [targetCount]
        : decomposeBatches(targetCount);

      let totalSynthesized = 0;
      for (const batch of batches) {
        const res = await postSynthesizeNext(bookId, batch);
        const batchDone = res.synthesizedCount ?? batch;
        totalSynthesized += batchDone;
        // Invalidate progressive queries so chapter list updates mid-flight
        queryClient.invalidateQueries({ queryKey: ['smart-chapters', bookId] });
        if (typeof res.synthesizedCount === 'number' && res.synthesizedCount < batch) {
          // Reached end of un-synthesized chapters
          break;
        }
      }
      return { success: true, synthesizedCount: totalSynthesized };
    },
    onMutate: (count: number) => {
      setInitialGenerated(generatedCount);
      setInFlightTarget(count);
      setToast(`Synthesizing ${count} ${count === 1 ? 'chapter…' : 'chapters…'}`);
    },
    onSuccess: (data, count) => {
      const done = data.synthesizedCount ?? count;
      queryClient.invalidateQueries({ queryKey: ['smart-chapters', bookId] });
      queryClient.invalidateQueries({ queryKey: ['smart-chapters', 'book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['smart-chapters'] });
      queryClient.invalidateQueries({ queryKey: ['editorial', bookId] });
      queryClient.invalidateQueries({ queryKey: ['editorial-progress', bookId] });
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });

      setToast(`${done} ${done === 1 ? 'chapter' : 'chapters'} ready`);
      onComplete?.();
    },
    onError: (err: any) => {
      setToast(err?.message || 'Synthesis failed');
    },
    onSettled: () => {
      setInFlightTarget(null);
    },
  });

  const handleSynthesize = (count: number) => {
    if (isSynthesizingActive || count <= 0) return;
    setIsDropdownOpen(false);
    synthesizeMutation.mutate(count);
  };

  if (totalCount <= 0) {
    return null;
  }

  // If already fully generated
  if (generatedCount >= totalCount) {
    return (
      <span className="inline-flex items-center text-caption text-ok font-medium select-none">
        ✓ All {totalCount} Omni chapters ready
      </span>
    );
  }

  // Calculate current progress done count for progress display: "Generating {done}/{target}…"
  const targetDisplay = inFlightTarget ?? primaryCount;
  const currentDoneCount = Math.min(
    targetDisplay,
    Math.max(
      0,
      liveSynthesized > initialGenerated
        ? liveSynthesized - initialGenerated
        : generatedCount > initialGenerated
        ? generatedCount - initialGenerated
        : 0
    )
  );

  const isDisabled = isSynthesizingActive || synthesizeMutation.isPending;

  return (
    <>
      <div className="relative inline-flex items-center rounded-md shadow-sm" ref={dropdownRef}>
        {/* Primary Action Button */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => handleSynthesize(primaryCount)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-ui-sm font-medium rounded-l-md bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all border-r border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title={
            isDisabled
              ? `Generating ${currentDoneCount}/${targetDisplay} chapters…`
              : `Synthesize next ${primaryCount} chapters`
          }
        >
          {isDisabled ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>
                Generating {currentDoneCount}/{targetDisplay}…
              </span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-accent-wash" aria-hidden="true" />
              <span>Synthesize next {primaryCount}</span>
            </>
          )}
        </button>

        {/* Dropdown Toggle */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className="inline-flex items-center px-2 py-2 text-ui-sm font-medium rounded-r-md bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Select synthesis batch size"
          aria-haspopup="true"
          aria-expanded={isDropdownOpen}
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            className="absolute left-0 top-full mt-1.5 w-60 rounded-lg bg-card border border-line shadow-xl py-1 z-50 text-ink text-ui-sm divide-y divide-line/40 animate-fade-in"
            role="menu"
            aria-orientation="vertical"
          >
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSynthesize(1)}
                className="w-full text-left px-3.5 py-2 hover:bg-subtle transition-colors flex items-center justify-between"
              >
                <span>Next 1 chapter</span>
                <span className="text-caption text-ink-muted">~15s</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => handleSynthesize(3)}
                className="w-full text-left px-3.5 py-2 hover:bg-subtle transition-colors flex items-center justify-between font-bold"
              >
                <span>Next 3 chapters</span>
                <span className="text-caption text-ink-muted">default · ~45s</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => handleSynthesize(5)}
                className="w-full text-left px-3.5 py-2 hover:bg-subtle transition-colors flex items-center justify-between"
              >
                <span>Next 5 chapters</span>
                <span className="text-caption text-ink-muted">~1.5m</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => handleSynthesize(10)}
                className="w-full text-left px-3.5 py-2 hover:bg-subtle transition-colors flex items-center justify-between"
              >
                <span>Next 10 chapters</span>
                <span className="text-caption text-ink-muted">~3.0m</span>
              </button>
            </div>

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSynthesize(remainingCount)}
                className="w-full text-left px-3.5 py-2 hover:bg-subtle transition-colors flex items-center justify-between text-brand font-medium"
              >
                <span>All remaining ({remainingCount} {remainingCount === 1 ? 'chapter' : 'chapters'})</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-ui-sm shadow-lg transition-all animate-fade-in"
        >
          <Zap className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      )}
    </>
  );
};

export default ChapterSynthesisButton;
