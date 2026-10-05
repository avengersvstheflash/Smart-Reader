import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface TagCountItem {
  tag: string;
  count?: number;
}

export type TagInput = string | TagCountItem;

export interface ExpandableTagPanelProps {
  tags: TagInput[];
  selectedTags?: string[];
  onToggle?: (tag: string) => void;
  onClear?: () => void;
  interactive?: boolean;
  className?: string;
  collapsedLimit?: number;
}

export const ExpandableTagPanel: React.FC<ExpandableTagPanelProps> = ({
  tags,
  selectedTags = [],
  onToggle,
  onClear,
  interactive = true,
  className = '',
  collapsedLimit = 4,
}) => {
  const [expanded, setExpanded] = useState(false);

  const normalizedTags = useMemo<TagCountItem[]>(() => {
    return tags.map((t) => (typeof t === 'string' ? { tag: t } : t));
  }, [tags]);

  if (normalizedTags.length === 0) {
    return null;
  }

  const hasOverflow = normalizedTags.length > collapsedLimit;
  const isSelected = (tag: string) => selectedTags.includes(tag);

  // In collapsed mode: on mobile (<sm) show collapsedLimit - 1 (e.g. 3), on sm+ show collapsedLimit (e.g. 4)
  const mobileLimit = Math.max(1, collapsedLimit - 1);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {expanded ? (
        <div className="flex flex-col gap-2 p-2.5 sm:p-3 rounded-lg bg-subtle/50 border border-line/60 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption font-medium text-ink-muted select-none">
              All tags ({normalizedTags.length})
            </span>
            <div className="flex items-center gap-3">
              {interactive && selectedTags.length > 0 && onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-caption text-ink-muted hover:text-ink underline select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  Clear tags
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center gap-1 text-caption text-ink-muted hover:text-ink font-medium select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded px-1 py-0.5"
              >
                <span>Show less</span>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {normalizedTags.map(({ tag, count }) => {
              const active = isSelected(tag);

              if (!interactive) {
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-caption font-medium bg-accent-2-soft text-accent-2 border border-accent-2-soft select-none"
                  >
                    <span>{tag}</span>
                    {typeof count === 'number' && (
                      <span className="text-[10px] opacity-70">({count})</span>
                    )}
                  </span>
                );
              }

              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle?.(tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-medium transition-all select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'bg-accent-2-soft text-accent-2 border-accent-2-soft shadow-xs'
                      : 'bg-card text-ink-muted border-line hover:bg-subtle hover:text-ink hover:border-line-strong'
                  }`}
                >
                  <span>{tag}</span>
                  {typeof count === 'number' && (
                    <span className="text-[10px] opacity-70">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {interactive && (
            <span className="text-caption text-ink-muted font-medium mr-0.5 shrink-0 select-none">
              Tags:
            </span>
          )}

          {normalizedTags.slice(0, collapsedLimit).map(({ tag, count }, idx) => {
            const active = isSelected(tag);
            // Hide the last collapsed item on mobile if beyond mobileLimit
            const isDesktopOnly = idx >= mobileLimit;
            const visibilityClass = isDesktopOnly ? 'hidden sm:inline-flex' : 'inline-flex';

            if (!interactive) {
              return (
                <span
                  key={tag}
                  className={`${visibilityClass} items-center gap-1 px-2 py-0.5 rounded text-caption font-medium bg-accent-2-soft text-accent-2 border border-accent-2-soft select-none`}
                >
                  <span>{tag}</span>
                  {typeof count === 'number' && (
                    <span className="text-[10px] opacity-70">({count})</span>
                  )}
                </span>
              );
            }

            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle?.(tag)}
                className={`${visibilityClass} items-center gap-1 px-2.5 py-1 rounded-full text-caption font-medium transition-all select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'bg-accent-2-soft text-accent-2 border-accent-2-soft shadow-xs'
                    : 'bg-card text-ink-muted border-line hover:bg-subtle hover:text-ink hover:border-line-strong'
                }`}
              >
                <span>{tag}</span>
                {typeof count === 'number' && (
                  <span className="text-[10px] opacity-70">({count})</span>
                )}
              </button>
            );
          })}

          {hasOverflow && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-medium text-ink-muted hover:text-ink border border-dashed border-line hover:border-line-strong bg-subtle/40 hover:bg-subtle transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`See all ${normalizedTags.length} tags`}
            >
              <span>See all ({normalizedTags.length})</span>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}

          {interactive && selectedTags.length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-caption text-ink-muted hover:text-ink underline ml-1 select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
};
