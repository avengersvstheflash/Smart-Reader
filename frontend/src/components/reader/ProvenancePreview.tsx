import { useEffect, useRef } from 'react';
import { ExternalLink, X, BookOpen } from 'lucide-react';
import { ParagraphAttribution, ProvenanceChunk } from '../../types/domain';

export interface ProvenancePreviewProps {
  paragraph_index?: number;
  paragraphIndex?: number;
  provenanceRow?: ParagraphAttribution | null;
  chunk?: ProvenanceChunk | null;
  onNavigate: (chunkId: string, chapterId?: string | null) => void;
  onClose: () => void;
}

export function ProvenancePreview({
  paragraph_index,
  paragraphIndex,
  provenanceRow,
  chunk,
  onNavigate,
  onClose,
}: ProvenancePreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const pIdx = paragraph_index ?? paragraphIndex ?? 0;
  void pIdx;

  // Close on Click Outside & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
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
  }, [onClose]);

  const isUngrounded =
    provenanceRow?.grounded === false || provenanceRow?.method === 'ungrounded';

  const isWeak =
    !isUngrounded &&
    Boolean(
      provenanceRow?.method === 'b_arbitrated' ||
      provenanceRow?.method === 'b_weak_c' ||
      provenanceRow?.method?.startsWith('b_')
    );

  const topChunkId = chunk?.id || provenanceRow?.source_chunk_ids?.[0];
  const sectionHeading = chunk?.section_heading;
  const sourcePage = chunk?.source_page;
  const rawExcerpt = chunk?.excerpt || '';
  const excerpt = rawExcerpt.trim().slice(0, 150);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Source attribution preview"
      className="absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-lg shadow-xl p-4 text-left animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 text-micro uppercase tracking-wider font-semibold text-muted">
          <BookOpen className="w-3.5 h-3.5 text-accent" />
          <span>Source Provenance</span>
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
          {/* Metadata Path & Page */}
          {(Boolean(sectionHeading) || (sourcePage !== null && sourcePage !== undefined)) && (
            <div className="flex items-center justify-between gap-2 text-micro text-ink-muted mb-2 font-mono">
              {sectionHeading && (
                <span className="truncate max-w-[70%]" title={sectionHeading}>
                  {sectionHeading}
                </span>
              )}
              {sourcePage !== null && sourcePage !== undefined && (
                <span className="shrink-0 bg-subtle px-1.5 py-0.5 rounded text-[10px]">
                  p. {sourcePage}
                </span>
              )}
            </div>
          )}

          {/* Excerpt */}
          {excerpt && (
            <div className="text-xs text-ink/90 italic bg-subtle/50 border-l-2 border-accent/60 pl-2.5 py-1 my-2 leading-relaxed">
              &ldquo;{excerpt}{excerpt.length >= 140 ? '…' : ''}&rdquo;
            </div>
          )}

          {/* Navigation to Original */}
          {topChunkId && (
            <div className="pt-2 mt-2 border-t border-line/40 flex justify-end">
              <button
                type="button"
                onClick={() => onNavigate(topChunkId, chunk?.chapter_id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ink hover:text-accent-hover transition-colors group cursor-pointer"
              >
                <span>View full source</span>
                <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
