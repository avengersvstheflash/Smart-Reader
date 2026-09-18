import React from 'react';
import { Chapter } from '../../types/domain';
import { CanonicalBlock } from './CanonicalBlock';

export function ReaderView({
  chapter,
  mode,
  fontSize,
  align,
}: {
  chapter: Chapter;
  mode: 'original' | 'smart';
  fontSize: number;
  align: 'left' | 'justify';
}) {
  const wordCount = chapter.wordCount ?? 0;
  const minutes = Math.max(1, Math.round(wordCount / 200));
  const blocks = chapter.canonicalBlocks ?? chapter.canonical_blocks ?? [];

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
      ) : (
        <div className="text-muted italic">Smart mode wires in B3.</div>
      )}
    </article>
  );
}
