import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ChapterNavItem {
  id: string;
  number: number;
  title: string;
  status?: string;
}

export function ChapterNav({
  chapters,
  currentId,
  onNavigate,
}: {
  chapters: ChapterNavItem[];
  currentId: string;
  onNavigate: (chapterId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentIndex = chapters.findIndex((c) => c.id === currentId);
  const n = currentIndex !== -1 ? currentIndex + 1 : 1;
  const m = chapters.length;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < chapters.length - 1;
  const prevId = hasPrev ? chapters[currentIndex - 1].id : null;
  const nextId = hasNext ? chapters[currentIndex + 1].id : null;

  const [highlightedIndex, setHighlightedIndex] = useState(
    currentIndex >= 0 ? currentIndex : 0
  );

  useEffect(() => {
    if (currentIndex >= 0) {
      setHighlightedIndex(currentIndex);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.focus();
    }
  }, [isOpen, highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % chapters.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + chapters.length) % chapters.length);
        break;
      case 'Home':
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setHighlightedIndex(chapters.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (chapters[highlightedIndex]) {
          onNavigate(chapters[highlightedIndex].id);
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  };

  return (
    <nav
      aria-label="Chapter navigation"
      className="relative flex items-center justify-between border-t border-[rgb(var(--line))] bg-[rgb(var(--surface)/0.92)] backdrop-blur-md shadow-[0_-8px_20px_rgba(0,0,0,0.5)] px-4 py-2"
    >
      {/* Prev Button */}
      <button
        type="button"
        aria-label="Previous chapter"
        aria-disabled={!hasPrev}
        className={`min-h-[44px] min-w-[44px] px-3 py-1.5 flex items-center gap-1 rounded-md transition-all font-medium text-sm select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          !hasPrev
            ? 'text-faint cursor-not-allowed opacity-50'
            : 'text-[rgb(var(--ink))] hover:text-[rgb(var(--accent))] hover:shadow-[0_0_12px_rgb(var(--accent)/0.4)] hover:bg-subtle/30'
        }`}
        onClick={() => {
          if (!hasPrev || !prevId) return;
          onNavigate(prevId);
        }}
      >
        <ChevronLeft className="w-4 h-4 mr-0.5" aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Center Region: Trigger + Popover */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="min-h-[44px] px-3 py-2 font-mono text-xs tracking-wider text-[rgb(var(--ink-muted))] hover:text-ink hover:bg-subtle/40 rounded transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (!isOpen && currentIndex >= 0) {
              setHighlightedIndex(currentIndex);
            }
          }}
        >
          Chapter {n} of {m}
        </button>

        {isOpen && (
          <div
            ref={popoverRef}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 md:w-80 max-h-80 overflow-y-auto bg-surface border border-line rounded-md shadow-lg p-1 z-30"
          >
            <ul
              role="listbox"
              aria-label="Chapters"
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              className="space-y-0.5 outline-none"
            >
              {chapters.map((ch, idx) => {
                const isActive = ch.id === currentId;
                const isHighlighted = highlightedIndex === idx;
                const isNonGenerated = ch.status && ch.status !== 'generated';
                const displayTitle = isNonGenerated
                  ? `Chapter ${ch.number}`
                  : (ch.title
                      ? (ch.title.startsWith(`Chapter ${ch.number}: `)
                          ? ch.title
                          : `Chapter ${ch.number}: ${ch.title}`)
                      : `Chapter ${ch.number}`);

                return (
                  <li key={ch.id} role="presentation">
                    <button
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      aria-current={isActive ? 'true' : undefined}
                      tabIndex={isHighlighted ? 0 : -1}
                      className={`w-full text-left px-3 py-2 text-ui-sm rounded transition-colors select-none focus:outline-none ${
                        isActive
                          ? 'bg-subtle text-ink font-semibold border-l-2 border-accent'
                          : 'text-ink-muted hover:text-ink hover:bg-subtle/50'
                      } ${isNonGenerated ? 'opacity-60' : ''} ${isHighlighted ? 'ring-1 ring-accent' : ''}`}
                      onClick={() => {
                        onNavigate(ch.id);
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 pr-2">
                          <span className="text-caption text-faint mr-2 font-mono">
                            {ch.number}.
                          </span>
                          <span className="truncate">{displayTitle}</span>
                        </div>
                        {isNonGenerated && (
                          <span className="text-micro px-1.5 py-0.5 rounded bg-subtle text-ink-muted shrink-0 capitalize">
                            {ch.status}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Next Button */}
      <button
        type="button"
        aria-label="Next chapter"
        aria-disabled={!hasNext}
        className={`min-h-[44px] min-w-[44px] px-3 py-1.5 flex items-center gap-1 rounded-md transition-all font-medium text-sm select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          !hasNext
            ? 'text-faint cursor-not-allowed opacity-50'
            : 'text-[rgb(var(--ink))] hover:text-[rgb(var(--accent))] hover:shadow-[0_0_12px_rgb(var(--accent)/0.4)] hover:bg-subtle/30'
        }`}
        onClick={() => {
          if (!hasNext || !nextId) return;
          onNavigate(nextId);
        }}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
      </button>
    </nav>
  );
}
