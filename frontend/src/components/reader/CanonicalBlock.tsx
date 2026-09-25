import React from 'react';
import {
  CanonicalBlock as CanonicalBlockType,
  ParagraphBlock,
  ParagraphAttribution,
  groupSegmentsIntoRuns,
  splitIntoSentences,
} from '../../types/domain';

// TODO(nested-emphasis): non-recursive parser. Handles **bold**,
// *italic*, `code`, ~~strike~~ individually but not nested combinations
// like *outer **inner** outer*. Sufficient for backend-extracted prose
// (plain text) and DeepSeek output (structural markdown only). If a
// user imports a .md file with nested emphasis, swap to a real parser
// (marked / remark) or make this recursive. Tracked in
// docs/SESSION_HANDOFF.md as a soft refactor item.
function renderInlineText(text?: string | null): React.ReactNode {
  if (!text) return null;
  const str = String(text);
  if (!/[*_`~]/.test(str)) {
    return str;
  }

  const parts: React.ReactNode[] = [];
  const regex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|`.*?`|~~.*?~~)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIdx) {
      parts.push(str.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      parts.push(
        <strong key={match.index}>
          <em>{token.slice(3, -3)}</em>
        </strong>
      );
    } else if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length > 4) {
      parts.push(<del key={match.index}>{token.slice(2, -2)}</del>);
    } else {
      parts.push(token);
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < str.length) {
    parts.push(str.slice(lastIdx));
  }

  return parts.length === 1 ? parts[0] : parts;
}

function getAlignClass(align?: string): string | undefined {
  if (align === 'center') return 'align-center';
  if (align === 'right') return 'align-right';
  return undefined;
}

export interface CanonicalBlockProps {
  block: CanonicalBlockType;
  isTtsActive?: boolean;
  provenanceRow?: ParagraphAttribution | null;
  activeRunIndex?: number | null;
  hoveredRunIndex?: number | null;
  onHoverRun?: (runIndex: number | null) => void;
  onClickRun?: (runIndex: number, chipEl: HTMLElement) => void;
  onClickSingleChip?: (chipEl: HTMLElement) => void;
  isSingleChipActive?: boolean;
}

interface CanonicalParagraphProps {
  block: ParagraphBlock;
  isTtsActive?: boolean;
  provenanceRow?: ParagraphAttribution | null;
  activeRunIndex?: number | null;
  hoveredRunIndex?: number | null;
  onHoverRun?: (runIndex: number | null) => void;
  onClickRun?: (runIndex: number, chipEl: HTMLElement) => void;
  onClickSingleChip?: (chipEl: HTMLElement) => void;
  isSingleChipActive?: boolean;
}

function CanonicalParagraph({
  block,
  isTtsActive,
  provenanceRow,
  activeRunIndex,
  hoveredRunIndex,
  onHoverRun,
  onClickRun,
  onClickSingleChip,
  isSingleChipActive,
}: CanonicalParagraphProps) {
  const paragraphRef = React.useRef<HTMLParagraphElement>(null);

  // Strip inline [Source N] citation markers — backend provenance
  // bookkeeping, not reader UX. Same for [Source N][Source M] chains
  // and parenthetical (Sources N-M) variants.
  const cleaned = (block.text || '')
    .replace(/\s*\[Source \d+\]/g, '')
    .replace(/\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)/g, '')
    .trim();

  const isUngrounded =
    provenanceRow?.grounded === false || provenanceRow?.method === 'ungrounded';
  const sentences = splitIntoSentences(cleaned);
  const runs = provenanceRow && !isUngrounded ? groupSegmentsIntoRuns(provenanceRow.segments) : [];

  React.useEffect(() => {
    if (import.meta.env.DEV && paragraphRef.current && provenanceRow && !isUngrounded) {
      const expected = runs.length;
      const rendered = paragraphRef.current.querySelectorAll('.segment-source-chip').length;
      if (expected !== rendered) {
        console.error(
          `[ChipMismatch] para ${provenanceRow.paragraph_index}: expected ${expected}, rendered ${rendered}`
        );
      }
    }
  }, [runs.length, provenanceRow, isUngrounded]);

  const hasActiveChip =
    (activeRunIndex !== null && activeRunIndex !== undefined) || Boolean(isSingleChipActive);

  if (provenanceRow) {
    if (runs.length > 0) {
      return (
        <p
          ref={paragraphRef}
          className="reader-paragraph"
          data-tts-active={isTtsActive ? 'true' : 'false'}
          data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
          data-has-active-chip={hasActiveChip ? 'true' : undefined}
        >
          {sentences.map((sent, sIdx) => {
            const matchingRuns = runs.filter(
              (r) => Math.min(r.sentenceEnd, sentences.length - 1) === sIdx
            );
            const hoveredRun =
              hoveredRunIndex !== null && hoveredRunIndex !== undefined
                ? runs.find((r) => r.runIndex === hoveredRunIndex)
                : null;
            const activeRun =
              activeRunIndex !== null && activeRunIndex !== undefined
                ? runs.find((r) => r.runIndex === activeRunIndex)
                : null;
            const isHighlighted = Boolean(
              (hoveredRun && sIdx >= hoveredRun.sentenceStart && sIdx <= hoveredRun.sentenceEnd) ||
              (activeRun && sIdx >= activeRun.sentenceStart && sIdx <= activeRun.sentenceEnd)
            );

            return (
              <React.Fragment key={sIdx}>
                <span
                  data-sentence-index={sIdx}
                  className={`sentence-span ${isHighlighted ? 'segment-highlighted' : ''}`}
                >
                  {renderInlineText(sent)}
                </span>
                {matchingRuns.map((run) => (
                  <button
                    key={run.runIndex}
                    type="button"
                    data-segment-run-index={run.runIndex}
                    onMouseEnter={() => onHoverRun?.(run.runIndex)}
                    onMouseLeave={() => onHoverRun?.(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickRun?.(run.runIndex, e.currentTarget);
                    }}
                    className={`segment-source-chip ${
                      activeRunIndex === run.runIndex
                        ? 'active'
                        : hoveredRunIndex === run.runIndex
                        ? 'hovered'
                        : ''
                    }`}
                    aria-label={`View source provenance for segment ${run.runIndex + 1}`}
                    aria-expanded={activeRunIndex === run.runIndex}
                  >
                    Source
                  </button>
                ))}
                {sIdx < sentences.length - 1 ? ' ' : ''}
              </React.Fragment>
            );
          })}
        </p>
      );
    }

    // If ungrounded: honest silence on chips, but preserve sentence-index structure
    if (isUngrounded) {
      return (
        <p
          ref={paragraphRef}
          className="reader-paragraph"
          data-tts-active={isTtsActive ? 'true' : 'false'}
          data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
        >
          {sentences.map((sent, sIdx) => (
            <React.Fragment key={sIdx}>
              <span data-sentence-index={sIdx} className="sentence-span">
                {renderInlineText(sent)}
              </span>
              {sIdx < sentences.length - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
        </p>
      );
    }

    // Fallback: grounded paragraph with no segments -> single paragraph-level chip at the end
    return (
      <p
        ref={paragraphRef}
        className="reader-paragraph"
        data-tts-active={isTtsActive ? 'true' : 'false'}
        data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
        data-has-active-chip={hasActiveChip ? 'true' : undefined}
      >
        {sentences.map((sent, sIdx) => (
          <React.Fragment key={sIdx}>
            <span data-sentence-index={sIdx} className="sentence-span">
              {renderInlineText(sent)}
            </span>
            {sIdx < sentences.length - 1 ? ' ' : ''}
          </React.Fragment>
        ))}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClickSingleChip?.(e.currentTarget);
          }}
          className={`segment-source-chip ${isSingleChipActive ? 'active' : ''}`}
          aria-label="View source provenance"
          aria-expanded={isSingleChipActive}
        >
          Source
        </button>
      </p>
    );
  }

  return (
    <p
      ref={paragraphRef}
      className="reader-paragraph"
      data-tts-active={isTtsActive ? 'true' : 'false'}
      data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
    >
      {renderInlineText(cleaned)}
    </p>
  );
}

export function CanonicalBlock({
  block,
  isTtsActive = false,
  provenanceRow,
  activeRunIndex,
  hoveredRunIndex,
  onHoverRun,
  onClickRun,
  onClickSingleChip,
  isSingleChipActive,
}: CanonicalBlockProps): React.ReactElement | null {
  switch (block.type) {
    case 'paragraph': {
      return (
        <CanonicalParagraph
          block={block as ParagraphBlock}
          isTtsActive={isTtsActive}
          provenanceRow={provenanceRow}
          activeRunIndex={activeRunIndex}
          hoveredRunIndex={hoveredRunIndex}
          onHoverRun={onHoverRun}
          onClickRun={onClickRun}
          onClickSingleChip={onClickSingleChip}
          isSingleChipActive={isSingleChipActive}
        />
      );
    }

    case 'heading': {
      const level = block.level ?? 2;
      if (level <= 2) {
        return <h2>{renderInlineText(block.text)}</h2>;
      }
      if (level === 3) {
        return <h3>{renderInlineText(block.text)}</h3>;
      }
      return <h4>{renderInlineText(block.text)}</h4>;
    }

    case 'quote': {
      // Strip inline [Source N] citation markers — backend provenance
      // bookkeeping, not reader UX. Same for [Source N][Source M] chains
      // and parenthetical (Sources N-M) variants.
      const cleaned = (block.text || '')
        .replace(/\s*\[Source \d+\]/g, '')
        .replace(/\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)/g, '')
        .trim();
      return (
        <blockquote>
          <p>{renderInlineText(cleaned)}</p>
        </blockquote>
      );
    }

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag>
          {(block.items || []).map((item, idx) => {
            if (typeof item === 'string') {
              return <li key={idx}>{renderInlineText(item)}</li>;
            }
            return (
              <li key={idx}>
                <CanonicalBlock block={item} />
              </li>
            );
          })}
        </ListTag>
      );
    }

    case 'code':
      return (
        <pre className="canonical-code">
          <code className={block.language ? `language-${block.language}` : undefined}>
            {block.text}
          </code>
        </pre>
      );

    case 'separator':
      return <hr />;

    case 'callout':
      return (
        <aside className="canonical-callout">
          {block.title && (
            <p>
              <strong>{renderInlineText(block.title)}</strong>
            </p>
          )}
          {block.text && <p>{renderInlineText(block.text)}</p>}
        </aside>
      );

    case 'table':
      return (
        <table className="canonical-table">
          {block.caption && <caption>{renderInlineText(block.caption)}</caption>}
          {block.headers && block.headers.length > 0 && (
            <thead>
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx} className={getAlignClass(block.alignments?.[idx])}>
                    {renderInlineText(h)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          {block.rows && block.rows.length > 0 && (
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className={getAlignClass(block.alignments?.[colIdx])}>
                      {renderInlineText(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );

    default:
      return null;
  }
}

