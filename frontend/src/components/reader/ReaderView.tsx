import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Chapter,
  ChapterRepresentation,
  CanonicalBlock as CanonicalBlockType,
  parseRepresentationMetadata,
} from '../../types/domain';
import { CanonicalBlock } from './CanonicalBlock';
import { SmartEmptyState } from './SmartEmptyState';
import { useProvenance } from '../../hooks/useProvenance';
import { ProvenancePreview } from './ProvenancePreview';

export interface ReaderViewProps {
  chapter: Chapter;
  representation: ChapterRepresentation | null;
  mode: 'original' | 'smart';
  fontSize: number;
  align: 'left' | 'justify';
  highlightChunkId?: string | null;
  onNavigateToSource?: (chunkId: string, targetChapterId?: string | null) => void;
  provenanceRepId?: string | null;
  smartState?: {
    hasOutline: boolean;
    remaining: number;
    busy: boolean;
    progress: { synthesized: number; total: number } | null;
    onGenerate: (n: number) => void;
    onBeginSmartReading: () => void;
  };
}

function getSmartBlocks(representation: ChapterRepresentation | null): CanonicalBlockType[] {
  if (!representation) return [];
  const meta = parseRepresentationMetadata(representation);
  if (Array.isArray(meta.canonicalBlocks) && meta.canonicalBlocks.length > 0) {
    return meta.canonicalBlocks;
  }
  // Fallback: if only `content` is present, we render a single paragraph
  // block so the reader at least sees something derived (not empty).
  if (representation.content && representation.content.trim().length > 0) {
    return [{ type: 'paragraph', text: representation.content }];
  }
  return [];
}

export function ReaderView({
  chapter,
  representation,
  mode,
  fontSize,
  align,
  highlightChunkId,
  onNavigateToSource,
  provenanceRepId,
  smartState,
}: ReaderViewProps) {
  const wordCount = chapter.wordCount ?? 0;
  const minutes = Math.max(1, Math.round(wordCount / 200));
  const blocks = chapter.canonicalBlocks ?? chapter.canonical_blocks ?? [];

  const smartBlocks = mode === 'smart' ? getSmartBlocks(representation) : [];
  const meta = representation ? parseRepresentationMetadata(representation) : {};
  const repText = representation?.content ?? '';
  const smartWordCount = repText.trim() ? repText.trim().split(/\s+/).length : 0;
  const smartMinutes = Math.max(1, Math.round(smartWordCount / 200));

  // Active preview card state for Smart paragraphs
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch provenance with chunks expanded
  const targetRepId = mode === 'smart' ? representation?.id : (provenanceRepId || representation?.id);
  const { provenance } = useProvenance(targetRepId, 'chunks');

  // Inverted map: block_id -> chunk_id for Original mode targeting
  const chunks = provenance?.chunks || {};
  const blockToChunkMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [cid, c] of Object.entries(chunks)) {
      if (Array.isArray(c.block_ids)) {
        for (const bid of c.block_ids) {
          if (bid) {
            map[bid] = cid;
          }
        }
      }
    }
    return map;
  }, [chunks]);

  // Scroll to highlighted chunk in Original mode
  useEffect(() => {
    if (mode !== 'original' || !highlightChunkId) return;

    const timer = setTimeout(() => {
      // 1. Try finding element with data-chunk-id === highlightChunkId
      let el = document.querySelector(`[data-chunk-id="${highlightChunkId}"]`);

      // 2. Fall back to first block referenced by the chunk's block_ids array
      if (!el && chunks[highlightChunkId]?.block_ids?.length) {
        const fallbackBlockId = chunks[highlightChunkId].block_ids[0];
        el = document.getElementById(fallbackBlockId) || document.querySelector(`[data-block-id="${fallbackBlockId}"]`);
      }

      // 3. Fall back to source_page if available
      if (!el && chunks[highlightChunkId]?.source_page !== null && chunks[highlightChunkId]?.source_page !== undefined) {
        const pageNum = chunks[highlightChunkId].source_page;
        el = document.querySelector(`[data-source-page="${pageNum}"]`);
      }

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        console.warn(`[ReaderView] Target element for chunk ${highlightChunkId} not found in chapter ${chapter.id}`);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [mode, highlightChunkId, chunks, blockToChunkMap, chapter.id]);

  const targetChunk = highlightChunkId ? chunks[highlightChunkId] : null;

  // Track paragraph index counter for Smart blocks
  let smartParagraphCounter = 0;

  return (
    <article
      className="prose prose-reader source-text"
      data-mode={mode}
      style={{ '--reading-size': `${fontSize}px`, textAlign: align } as React.CSSProperties}
    >
      {mode === 'original' ? (
        <>
          <div className="source-label text-micro tracking-wide uppercase text-faint font-medium select-none">
            SOURCE · IMMUTABLE
          </div>

          <h1 className="display">{chapter.title}</h1>

          <p className="text-caption text-muted m-0">
            {wordCount} words · ~{minutes} min
          </p>

          <hr className="my-6 border-line" />

          {blocks.length > 0 ? (
            blocks.map((block, i) => {
              const explicitBlockId = block.id;
              const fallbackBlockId = `blk-${chapter.id}-${i}`;
              const blockId = explicitBlockId || fallbackBlockId;

              // Find chunk ID mapped to this block
              let chunkId = (explicitBlockId && blockToChunkMap[explicitBlockId]) || blockToChunkMap[fallbackBlockId];
              if (!chunkId) {
                // Check if any chunk sequence matches block index
                for (const c of Object.values(chunks)) {
                  if (c.sequence === i) {
                    chunkId = c.id;
                    break;
                  }
                }
              }

              const isHighlighted = Boolean(
                highlightChunkId && (
                  chunkId === highlightChunkId ||
                  (targetChunk?.block_ids?.includes(blockId)) ||
                  (explicitBlockId && targetChunk?.block_ids?.includes(explicitBlockId))
                )
              );

              const thisChunk = chunkId ? chunks[chunkId] : null;
              const isNeighboring = Boolean(
                !isHighlighted &&
                targetChunk &&
                targetChunk.sequence !== null &&
                targetChunk.sequence !== undefined &&
                thisChunk &&
                thisChunk.sequence !== null &&
                thisChunk.sequence !== undefined &&
                Math.abs(thisChunk.sequence - targetChunk.sequence) === 1
              );

              const blockClasses = [
                'canonical-block',
                isHighlighted ? 'chunk-highlighted' : '',
                isNeighboring ? 'chunk-neighboring' : '',
              ].filter(Boolean).join(' ');

              return (
                <div
                  key={i}
                  id={fallbackBlockId}
                  data-block-id={blockId}
                  data-chunk-id={chunkId || undefined}
                  className={blockClasses}
                >
                  <CanonicalBlock block={block} isTtsActive={false} />
                </div>
              );
            })
          ) : (
            <div>
              <p className="text-caption text-muted italic">
                Rendering raw text — canonical blocks unavailable.
              </p>
              {(chapter.content || '')
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
            </div>
          )}
        </>
      ) : representation && smartBlocks.length > 0 ? (
        <div className="border-l-2 border-accent pl-4 sm:pl-6">
          <div className="text-micro tracking-wide uppercase text-accent-ink font-medium select-none">
            DERIVED · TRACEABLE
          </div>

          {meta.fell_back === true && (
            <p className="text-caption text-ink-muted mt-1 mb-0">
              {meta.duplicate === true
                ? 'Duplicate fallback — the AI was unable to generate distinct content for this chapter.'
                : 'Structured extract — model unavailable. This chapter was not synthesized by the AI.'}
            </p>
          )}

          <h1 className="display">{chapter.title}</h1>

          <p className="text-caption text-muted m-0">
            {smartWordCount} words · ~{smartMinutes} min
          </p>

          <hr className="my-6 border-line" />

          {smartBlocks.map((block, i) => {
            const isParagraph = block.type === 'paragraph';
            const currentParaIndex = isParagraph ? smartParagraphCounter++ : -1;
            const provenanceRow =
              isParagraph && provenance?.paragraphs
                ? provenance.paragraphs.find((p) => p.paragraph_index === currentParaIndex)
                : null;

            const isUngrounded =
              provenanceRow?.grounded === false || provenanceRow?.method === 'ungrounded';
            const topChunkId = provenanceRow?.source_chunk_ids?.[0];
            const topChunk = topChunkId ? chunks[topChunkId] : null;

            const isPreviewOpen = activePreviewIndex === currentParaIndex;

            const handleTouchStart = () => {
              if (isParagraph && provenanceRow) {
                touchTimerRef.current = setTimeout(() => {
                  setActivePreviewIndex(isPreviewOpen ? null : currentParaIndex);
                }, 450);
              }
            };

            const handleTouchEnd = () => {
              if (touchTimerRef.current) {
                clearTimeout(touchTimerRef.current);
                touchTimerRef.current = null;
              }
            };

            return (
              <div
                key={i}
                id={`sblk-${representation.id}-${i}`}
                className={`canonical-block relative group transition-colors rounded ${
                  isParagraph ? 'hover:bg-subtle/30 px-1 -mx-1' : ''
                } ${isPreviewOpen ? 'z-30' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <CanonicalBlock block={block} isTtsActive={false} />

                {/* Source attribution chip on hover/focus/active */}
                {isParagraph && provenanceRow && (
                  <div className="absolute right-1 -top-2.5 z-20">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreviewIndex(isPreviewOpen ? null : currentParaIndex);
                      }}
                      className={`text-micro px-2 py-0.5 rounded-full border transition-all duration-150 select-none shadow-sm flex items-center gap-1 cursor-pointer ${
                        isPreviewOpen
                          ? 'bg-accent text-white border-accent opacity-100 ring-2 ring-accent/30'
                          : isUngrounded
                          ? 'bg-surface text-ink-muted border-line hover:text-ink hover:border-line-strong group-hover:opacity-100 opacity-0 pointer-events-none group-hover:pointer-events-auto'
                          : 'bg-surface/95 text-ink-muted hover:text-accent-ink hover:border-accent border-line group-hover:opacity-100 opacity-0 pointer-events-none group-hover:pointer-events-auto'
                      }`}
                      aria-label={isUngrounded ? 'No traced source' : 'View source chunk provenance'}
                      aria-expanded={isPreviewOpen}
                    >
                      <span className="font-mono uppercase text-[9px] tracking-wider font-semibold">
                        {isUngrounded ? 'No source' : 'Source'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Inline preview card anchored to the paragraph */}
                {isParagraph && isPreviewOpen && provenanceRow && (
                  <ProvenancePreview
                    paragraph_index={currentParaIndex}
                    provenanceRow={provenanceRow}
                    chunk={topChunk}
                    onNavigate={(chunkId, targetChapterId) => {
                      setActivePreviewIndex(null);
                      if (onNavigateToSource) {
                        onNavigateToSource(chunkId, targetChapterId || chapter.id);
                      }
                    }}
                    onClose={() => setActivePreviewIndex(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : smartState ? (
        <SmartEmptyState
          hasOutline={smartState.hasOutline}
          remaining={smartState.remaining}
          busy={smartState.busy}
          progress={smartState.progress}
          onGenerate={smartState.onGenerate}
          onBeginSmartReading={smartState.onBeginSmartReading}
        />
      ) : (
        <SmartEmptyState
          hasOutline={false}
          remaining={0}
          busy={false}
          progress={null}
          onGenerate={() => {}}
          onBeginSmartReading={() => {}}
        />
      )}
    </article>
  );
}
