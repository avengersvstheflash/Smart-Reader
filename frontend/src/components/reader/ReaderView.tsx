import React, { useState, useEffect, useMemo } from 'react';
import {
  Chapter,
  ChapterRepresentation,
  CanonicalBlock as CanonicalBlockType,
  parseRepresentationMetadata,
  groupSegmentsIntoRuns,
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

  // Active preview card state for segment runs
  const [activePreview, setActivePreview] = useState<{
    paraIndex: number;
    runIndex: number;
    chunkId: string;
  } | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredRunByPara, setHoveredRunByPara] = useState<Record<number, number | null>>({});

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

            return (
              <div
                key={i}
                id={`sblk-${representation.id}-${i}`}
                className={`canonical-block relative group transition-colors rounded ${
                  isParagraph ? 'px-1 -mx-1' : ''
                }`}
              >
                <CanonicalBlock
                  block={block}
                  isTtsActive={false}
                  provenanceRow={provenanceRow}
                  activeRunIndex={
                    activePreview?.paraIndex === currentParaIndex
                      ? activePreview.runIndex
                      : null
                  }
                  hoveredRunIndex={hoveredRunByPara[currentParaIndex] ?? null}
                  onHoverRun={(runIdx) =>
                    setHoveredRunByPara((prev) => ({ ...prev, [currentParaIndex]: runIdx }))
                  }
                  onClickRun={(runIdx, chipEl) => {
                    if (
                      activePreview?.paraIndex === currentParaIndex &&
                      activePreview?.runIndex === runIdx
                    ) {
                      setActivePreview(null);
                      setAnchorEl(null);
                    } else {
                      const runs = groupSegmentsIntoRuns(provenanceRow?.segments);
                      const targetRun = runs.find((r) => r.runIndex === runIdx);
                      const targetChunkId =
                        targetRun?.chunkId || provenanceRow?.source_chunk_ids?.[0] || '';
                      setActivePreview({
                        paraIndex: currentParaIndex,
                        runIndex: runIdx,
                        chunkId: targetChunkId,
                      });
                      setAnchorEl(chipEl);
                    }
                  }}
                  onClickSingleChip={(chipEl) => {
                    if (
                      activePreview?.paraIndex === currentParaIndex &&
                      activePreview?.runIndex === -1
                    ) {
                      setActivePreview(null);
                      setAnchorEl(null);
                    } else {
                      const targetChunkId = provenanceRow?.source_chunk_ids?.[0] || '';
                      setActivePreview({
                        paraIndex: currentParaIndex,
                        runIndex: -1,
                        chunkId: targetChunkId,
                      });
                      setAnchorEl(chipEl);
                    }
                  }}
                  isSingleChipActive={
                    activePreview?.paraIndex === currentParaIndex &&
                    activePreview?.runIndex === -1
                  }
                />
              </div>
            );
          })}

          {/* Floating preview card anchored to the active chip */}
          {activePreview && anchorEl && (
            <ProvenancePreview
              paragraph_index={activePreview.paraIndex}
              provenanceRow={
                provenance?.paragraphs?.find(
                  (p) => p.paragraph_index === activePreview.paraIndex
                ) || null
              }
              chunk={chunks[activePreview.chunkId] || null}
              anchorRef={anchorEl}
              onNavigate={(chunkId, targetChapterId) => {
                setActivePreview(null);
                setAnchorEl(null);
                if (onNavigateToSource) {
                  onNavigateToSource(chunkId, targetChapterId || chapter.id);
                }
              }}
              onClose={() => {
                setActivePreview(null);
                setAnchorEl(null);
              }}
            />
          )}
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
