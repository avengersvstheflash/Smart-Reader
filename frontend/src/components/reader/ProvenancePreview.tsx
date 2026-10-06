import React, { useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react';
import { ExternalLink, X, BookOpen } from 'lucide-react';
import { ParagraphAttribution, ProvenanceChunk } from '../../types/domain';

export interface ProvenancePreviewProps {
  paragraph_index?: number;
  paragraphIndex?: number;
  provenanceRow?: ParagraphAttribution | null;
  chunk?: ProvenanceChunk | null;
  chunkIds?: string[];
  chunks?: Record<string, ProvenanceChunk>;
  anchorRef?: React.RefObject<HTMLElement> | HTMLElement | null;
  onNavigate: (chunkId: string, chapterId?: string | null) => void;
  onClose: () => void;
}

function cleanExcerpt(raw?: string | null): string {
  if (!raw) return '';
  const stripped = raw.replace(/^(?:\[Section:\s*[^\]]+\]\s*)+/gi, '').trim();
  if (stripped.length > 150 && !stripped.endsWith('…')) {
    return stripped.slice(0, 150).trimEnd() + '…';
  }
  return stripped;
}

export function ProvenancePreview({
  paragraph_index,
  paragraphIndex,
  provenanceRow,
  chunk,
  chunkIds,
  chunks,
  anchorRef,
  onNavigate,
  onClose,
}: ProvenancePreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const pIdx = paragraph_index ?? paragraphIndex ?? 0;
  void pIdx;

  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});

  // Resolve list of chunk IDs to display
  const resolvedChunkIds: string[] = useMemo(() => {
    if (Array.isArray(chunkIds) && chunkIds.length > 0) {
      return chunkIds;
    }
    if (chunk?.id) {
      return [chunk.id];
    }
    if (Array.isArray(provenanceRow?.source_chunk_ids) && provenanceRow.source_chunk_ids.length > 0) {
      return provenanceRow.source_chunk_ids;
    }
    return [];
  }, [chunkIds, chunk, provenanceRow]);

  // Close on Click Outside & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const chipEl = anchorRef instanceof HTMLElement ? anchorRef : anchorRef?.current;
      if (chipEl && chipEl.contains(e.target as Node)) {
        return;
      }
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, anchorRef]);

  // Compute position directly below the anchor chip
  useLayoutEffect(() => {
    const chipEl = anchorRef instanceof HTMLElement ? anchorRef : anchorRef?.current;
    if (!chipEl) return;

    const updatePosition = () => {
      const rect = chipEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidth = Math.min(resolvedChunkIds.length > 1 ? 400 : 384, viewportWidth - 32);

      const isRightHalf = rect.left + rect.width / 2 > viewportWidth / 2;
      const top = rect.bottom + 8;

      const style: React.CSSProperties = {
        position: 'fixed',
        top: `${top}px`,
        width: `${cardWidth}px`,
        maxWidth: 'calc(100vw - 2rem)',
        zIndex: 50,
      };

      if (isRightHalf) {
        // Align right edge of card to right edge of chip
        const rightDist = viewportWidth - rect.right;
        const clampedRight = Math.max(16, Math.min(rightDist, viewportWidth - cardWidth - 16));
        style.right = `${clampedRight}px`;
      } else {
        // Align left edge of card to left edge of chip
        const clampedLeft = Math.max(16, Math.min(rect.left, viewportWidth - cardWidth - 16));
        style.left = `${clampedLeft}px`;
      }

      // If card overflows viewport bottom, flip above chip if vertical space permits
      if (top + 280 > viewportHeight && rect.top > 300) {
        delete style.top;
        style.bottom = `${viewportHeight - rect.top + 8}px`;
      }

      setPositionStyle(style);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, resolvedChunkIds.length]);

  const isUngrounded =
    provenanceRow?.grounded === false || provenanceRow?.method === 'ungrounded';

  const isWeak =
    !isUngrounded &&
    Boolean(
      provenanceRow?.method === 'b_arbitrated' ||
      provenanceRow?.method === 'b_weak_c' ||
      provenanceRow?.method?.startsWith('b_')
    );

  const isMultiSource = resolvedChunkIds.length > 1;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Source attribution preview"
      style={anchorRef ? positionStyle : undefined}
      className={
        anchorRef
          ? 'fixed z-50 bg-[rgb(var(--surface))] border border-[rgb(var(--accent)/0.5)] shadow-[0_0_25px_rgb(var(--accent)/0.25)] rounded-xl backdrop-blur-md p-4 text-left animate-in fade-in zoom-in-95 duration-150'
          : 'absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-[rgb(var(--surface))] border border-[rgb(var(--accent)/0.5)] shadow-[0_0_25px_rgb(var(--accent)/0.25)] rounded-xl backdrop-blur-md p-4 text-left animate-in fade-in zoom-in-95 duration-150'
      }
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 text-micro uppercase tracking-wider font-semibold text-[rgb(var(--accent))] font-mono text-xs">
          <BookOpen className="w-3.5 h-3.5 text-[rgb(var(--accent))]" />
          <span>{isMultiSource ? `Sources (${resolvedChunkIds.length})` : 'Source Provenance'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="text-muted hover:text-ink rounded p-0.5 hover:bg-subtle transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Trust discipline markers */}
      {isUngrounded && (
        <div className="py-2">
          <p className="text-caption text-ink-muted italic mb-0">
            No traced source for this paragraph.
          </p>
        </div>
      )}

      {isWeak && (
        <div className="mb-2.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-700 dark:text-amber-400 font-medium">
          Attributed from source chunks and neighboring context.
        </div>
      )}

      {!isUngrounded && (
        <>
          {resolvedChunkIds.length === 0 ? (
            <div className="py-2">
              <p className="text-caption text-ink-muted italic mb-0">
                Source details not available.
              </p>
            </div>
          ) : isMultiSource ? (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {resolvedChunkIds.map((cid) => {
                const c = chunks?.[cid] || (cid === chunk?.id ? chunk : null);
                const cHeading = c?.section_heading;
                const cPage = c?.source_page;
                const cExcerpt = cleanExcerpt(c?.excerpt);

                return (
                  <div
                    key={cid}
                    className="p-2.5 rounded-md border border-line/60 bg-subtle/30 space-y-2"
                  >
                    {/* Metadata Path & Page Badge */}
                    {(Boolean(cHeading) || (cPage !== null && cPage !== undefined)) && (
                      <div className="flex items-center justify-between gap-2 text-micro text-ink-muted font-mono">
                        {cHeading ? (
                          <span
                            className="truncate max-w-[75%] font-semibold uppercase tracking-wider text-[10px] text-accent-ink"
                            title={cHeading}
                          >
                            {cHeading}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase text-muted">Source Excerpt</span>
                        )}
                        {cPage !== null && cPage !== undefined && (
                          <span className="shrink-0 bg-[rgb(var(--subtle))] text-[rgb(var(--accent-4))] border border-[rgb(var(--accent-4)/0.4)] px-1.5 py-0.5 rounded font-mono text-xs">
                            p. {cPage}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Excerpt */}
                    {cExcerpt ? (
                      <div className="bg-[rgb(var(--panel))] border-l-2 border-[rgb(var(--accent-2))] text-[rgb(var(--ink))] p-3 italic text-sm leading-relaxed rounded-r">
                        &ldquo;{cExcerpt}&rdquo;
                      </div>
                    ) : (
                      <div className="text-xs text-ink-muted italic py-1">
                        No excerpt available for this chunk.
                      </div>
                    )}

                    {/* Navigate to Original */}
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onNavigate(cid, c?.chapter_id)}
                        className="inline-flex items-center gap-1.5 text-[rgb(var(--accent-ink))] hover:text-[rgb(var(--accent))] hover:underline font-mono text-xs transition-colors group cursor-pointer"
                      >
                        <span>View full source</span>
                        <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (() => {
              const singleCid = resolvedChunkIds[0];
              const c = chunks?.[singleCid] || (singleCid === chunk?.id ? chunk : null);
              const sectionHeading = c?.section_heading;
              const sourcePage = c?.source_page;
              const excerpt = cleanExcerpt(c?.excerpt);

              return (
                <div className="space-y-2">
                  {/* Metadata Path & Page Badge */}
                  {(Boolean(sectionHeading) || (sourcePage !== null && sourcePage !== undefined)) && (
                    <div className="flex items-center justify-between gap-2 text-micro text-ink-muted font-mono">
                      {sectionHeading ? (
                        <span
                          className="truncate max-w-[75%] font-semibold uppercase tracking-wider text-[10px] text-accent-ink"
                          title={sectionHeading}
                        >
                          {sectionHeading}
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase text-muted">Source Excerpt</span>
                      )}
                      {sourcePage !== null && sourcePage !== undefined && (
                        <span className="shrink-0 bg-[rgb(var(--subtle))] text-[rgb(var(--accent-4))] border border-[rgb(var(--accent-4)/0.4)] px-1.5 py-0.5 rounded font-mono text-xs">
                          p. {sourcePage}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Excerpt */}
                  {excerpt && (
                    <div className="bg-[rgb(var(--panel))] border-l-2 border-[rgb(var(--accent-2))] text-[rgb(var(--ink))] p-3 italic text-sm my-2 leading-relaxed rounded-r">
                      &ldquo;{excerpt}&rdquo;
                    </div>
                  )}

                  {/* Navigation to Original */}
                  {singleCid && (
                    <div className="pt-2 mt-2 border-t border-line/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onNavigate(singleCid, c?.chapter_id)}
                        className="inline-flex items-center gap-1.5 text-[rgb(var(--accent-ink))] hover:text-[rgb(var(--accent))] hover:underline font-mono text-xs transition-colors group cursor-pointer"
                      >
                        <span>View full source</span>
                        <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}
