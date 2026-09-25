import React from 'react';
import {
  CanonicalBlock as CanonicalBlockType,
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
      // Strip inline [Source N] citation markers — backend provenance
      // bookkeeping, not reader UX. Same for [Source N][Source M] chains
      // and parenthetical (Sources N-M) variants.
      const cleaned = (block.text || '')
        .replace(/\s*\[Source \d+\]/g, '')
        .replace(/\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)/g, '')
        .trim();

      if (provenanceRow) {
        const isUngrounded =
          provenanceRow.grounded === false || provenanceRow.method === 'ungrounded';
        const sentences = splitIntoSentences(cleaned);
        const runs = isUngrounded ? [] : groupSegmentsIntoRuns(provenanceRow.segments);

        if (runs.length > 0) {
          return (
            <p
              className="reader-paragraph"
              data-tts-active={isTtsActive ? 'true' : 'false'}
              data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
            >
              {sentences.map((sent, sIdx) => {
                const matchingRun = runs.find((r) => r.sentenceEnd === sIdx);
                const hoveredRun =
                  hoveredRunIndex !== null && hoveredRunIndex !== undefined
                    ? runs[hoveredRunIndex]
                    : null;
                const activeRun =
                  activeRunIndex !== null && activeRunIndex !== undefined
                    ? runs[activeRunIndex]
                    : null;
                const isHighlighted = Boolean(
                  (hoveredRun && sIdx >= hoveredRun.sentenceStart && sIdx <= hoveredRun.sentenceEnd) ||
                  (activeRun && sIdx >= activeRun.sentenceStart && sIdx <= activeRun.sentenceEnd)
                );

                return (
                  <span
                    key={sIdx}
                    data-sentence-index={sIdx}
                    className={`sentence-span ${isHighlighted ? 'segment-highlighted' : ''}`}
                  >
                    {renderInlineText(sent)}
                    {matchingRun && (
                      <span className="inline-chip-wrapper inline-flex items-center align-baseline">
                        <button
                          type="button"
                          data-segment-run-index={matchingRun.runIndex}
                          onMouseEnter={() => onHoverRun?.(matchingRun.runIndex)}
                          onMouseLeave={() => onHoverRun?.(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickRun?.(matchingRun.runIndex, e.currentTarget);
                          }}
                          className={`inline-chip text-micro px-1.5 py-0.2 ml-1.5 rounded-full border transition-all duration-150 select-none align-baseline cursor-pointer text-[9px] font-mono uppercase tracking-wider font-semibold ${
                            activeRunIndex === matchingRun.runIndex
                              ? 'bg-accent text-white border-accent opacity-100 ring-2 ring-accent/30'
                              : hoveredRunIndex === matchingRun.runIndex
                              ? 'bg-surface text-accent-ink border-accent opacity-100 shadow-sm'
                              : 'bg-surface/95 text-ink-muted hover:text-accent-ink hover:border-accent border-line group-hover:opacity-100 opacity-0'
                          }`}
                          aria-label={`View source provenance for segment ${matchingRun.runIndex + 1}`}
                          aria-expanded={activeRunIndex === matchingRun.runIndex}
                        >
                          Source
                        </button>
                      </span>
                    )}
                    {sIdx < sentences.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </p>
          );
        }

        // If ungrounded: honest silence on chips, but preserve sentence-index structure
        if (isUngrounded) {
          return (
            <p
              className="reader-paragraph"
              data-tts-active={isTtsActive ? 'true' : 'false'}
              data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
            >
              {sentences.map((sent, sIdx) => (
                <span key={sIdx} data-sentence-index={sIdx} className="sentence-span">
                  {renderInlineText(sent)}
                  {sIdx < sentences.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          );
        }

        // Fallback: grounded paragraph with no segments -> single paragraph-level chip at the end
        return (
          <p
            className="reader-paragraph"
            data-tts-active={isTtsActive ? 'true' : 'false'}
            data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
          >
            {sentences.map((sent, sIdx) => (
              <span key={sIdx} data-sentence-index={sIdx} className="sentence-span">
                {renderInlineText(sent)}
                {sIdx < sentences.length - 1 ? ' ' : ''}
              </span>
            ))}
            <span className="inline-chip-wrapper inline-flex items-center align-baseline">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickSingleChip?.(e.currentTarget);
                }}
                className={`inline-chip text-micro px-1.5 py-0.2 ml-1.5 rounded-full border transition-all duration-150 select-none align-baseline cursor-pointer text-[9px] font-mono uppercase tracking-wider font-semibold ${
                  isSingleChipActive
                    ? 'bg-accent text-white border-accent opacity-100 ring-2 ring-accent/30'
                    : 'bg-surface/95 text-ink-muted hover:text-accent-ink hover:border-accent border-line group-hover:opacity-100 opacity-0'
                }`}
                aria-label="View source provenance"
                aria-expanded={isSingleChipActive}
              >
                Source
              </button>
            </span>
          </p>
        );
      }

      return (
        <p
          className="reader-paragraph"
          data-tts-active={isTtsActive ? 'true' : 'false'}
          data-source-page={block.sourcePage !== undefined ? block.sourcePage : undefined}
        >
          {renderInlineText(cleaned)}
        </p>
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

