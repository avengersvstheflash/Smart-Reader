import React from 'react';
import { Feather } from 'lucide-react';
import {
  Chapter,
  ChapterRepresentation,
  CanonicalBlock as CanonicalBlockType,
  parseRepresentationMetadata,
} from '../../types/domain';
import { CanonicalBlock } from './CanonicalBlock';

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
}: {
  chapter: Chapter;
  representation: ChapterRepresentation | null;
  mode: 'original' | 'smart';
  fontSize: number;
  align: 'left' | 'justify';
}) {
  const wordCount = chapter.wordCount ?? 0;
  const minutes = Math.max(1, Math.round(wordCount / 200));
  const blocks = chapter.canonicalBlocks ?? chapter.canonical_blocks ?? [];

  const smartBlocks = mode === 'smart' ? getSmartBlocks(representation) : [];
  const meta = representation ? parseRepresentationMetadata(representation) : {};
  const repText = representation?.content ?? '';
  const smartWordCount = repText.trim() ? repText.trim().split(/\s+/).length : 0;
  const smartMinutes = Math.max(1, Math.round(smartWordCount / 200));

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
            blocks.map((block, i) => (
              <div key={i} id={`blk-${chapter.id}-${i}`} className="canonical-block">
                <CanonicalBlock block={block} />
              </div>
            ))
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
            <p className="text-caption text-muted italic mt-1 mb-0">
              Structured extract — model unavailable.
            </p>
          )}

          <h1 className="display">{chapter.title}</h1>

          <p className="text-caption text-muted m-0">
            {smartWordCount} words · ~{smartMinutes} min
          </p>

          <hr className="my-6 border-line" />

          {smartBlocks.map((block, i) => (
            <div
              key={i}
              id={`sblk-${representation.id}-${i}`}
              className="canonical-block"
            >
              <CanonicalBlock block={block} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6">
          <Feather className="w-8 h-8 text-faint mb-4" aria-hidden="true" />
          <h2 className="text-h3 font-semibold text-ink mb-2">
            Smart Reading hasn't been generated yet
          </h2>
          <p className="text-body text-ink-muted max-w-md">
            Chapters written from the source, every line traceable back to it.
            The original is never modified.
          </p>
        </div>
      )}
    </article>
  );
}
