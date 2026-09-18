import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Chapter } from '../../types/domain';

export function ChapterNav({
  chapters,
  currentId,
  onNavigate,
}: {
  chapters: Pick<Chapter, 'id' | 'number' | 'title'>[];
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
      className="relative flex items-center justify-between border-t border-line bg-card px-4 py-2"
    >
      {/* Prev Button */}
      <button
        type="button"
        aria-label="Previous chapter"
        aria-disabled={!hasPrev}
        className={`min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center rounded transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          !hasPrev
            ? 'text-faint cursor-not-allowed opacity-50'
            : 'text-ink hover:bg-subtle'
        }`}
        onClick={() => {
          if (!hasPrev || !prevId) return;
          onNavigate(prevId);
        }}
      >
        <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
        <span className="hidden sm:inline text-ui-sm font-medium">Previous</span>
      </button>

      {/* Center Region: Trigger + Popover */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="min-h-[44px] px-3 py-2 text-ui-sm font-medium text-ink hover:bg-subtle rounded transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                      } ${isHighlighted ? 'ring-1 ring-accent' : ''}`}
                      onClick={() => {
                        onNavigate(ch.id);
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      <span className="text-caption text-faint mr-2 font-mono">
                        {ch.number}.
                      </span>
                      <span className="truncate">{ch.title}</span>
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
        className={`min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center rounded transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          !hasNext
            ? 'text-faint cursor-not-allowed opacity-50'
            : 'text-ink hover:bg-subtle'
        }`}
        onClick={() => {
          if (!hasNext || !nextId) return;
          onNavigate(nextId);
        }}
      >
        <span className="hidden sm:inline text-ui-sm font-medium">Next</span>
        <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
      </button>
    </nav>
  );
}
