import {
  Chapter,
  ChapterRepresentation,
  CanonicalBlock as CanonicalBlockType,
  parseRepresentationMetadata,
} from '../../types/domain';
import { CanonicalBlock } from './CanonicalBlock';
import { SmartEmptyState } from './SmartEmptyState';

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
  smartState,
}: {
  chapter: Chapter;
  representation: ChapterRepresentation | null;
  mode: 'original' | 'smart';
  fontSize: number;
  align: 'left' | 'justify';
  smartState?: {
    hasOutline: boolean;
    remaining: number;
    busy: boolean;
    progress: { synthesized: number; total: number } | null;
    onGenerate: (n: number) => void;
    onBeginSmartReading: () => void;
  };
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
