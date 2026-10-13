import React from 'react';
import { ChevronDown, ChevronUp, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HelpItemData } from './HelpSidebar';

interface HelpAccordionProps {
  items: HelpItemData[];
  expandedItemId: string | null;
  onToggleItem: (id: string) => void;
  categoryLabel?: string;
  categoryDescription?: string;
}

// Simple and safe formatter for markdown snippets within help text
function renderFormattedAnswer(text: string) {
  const paragraphs = text.split(/\n\n+/);

  return (
    <div className="space-y-3 text-caption text-ink leading-relaxed">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split(/\n/);
        const isBulletList = lines.every((l) => l.trim().startsWith('- ') || l.trim() === '');
        const isNumberList = lines.every((l) => /^\d+\.\s/.test(l.trim()) || l.trim() === '');

        if (isBulletList) {
          return (
            <ul key={pIdx} className="list-disc list-inside space-y-1.5 pl-1">
              {lines.filter((l) => l.trim().startsWith('- ')).map((line, lIdx) => (
                <li key={lIdx} className="text-ink-muted">
                  {renderInlineMarkdown(line.trim().slice(2))}
                </li>
              ))}
            </ul>
          );
        }

        if (isNumberList) {
          return (
            <ol key={pIdx} className="list-decimal list-inside space-y-1.5 pl-1">
              {lines.filter((l) => /^\d+\.\s/.test(l.trim())).map((line, lIdx) => {
                const content = line.trim().replace(/^\d+\.\s+/, '');
                return (
                  <li key={lIdx} className="text-ink-muted">
                    {renderInlineMarkdown(content)}
                  </li>
                );
              })}
            </ol>
          );
        }

        return (
          <p key={pIdx} className="text-ink-muted">
            {renderInlineMarkdown(para)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  // Regex to split by markdown links [label](url), backticks `code`, and bold **text**
  const regex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      if (code === '/settings' || code === '/import') {
        return (
          <Link
            key={idx}
            to={code}
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent-ink hover:underline border border-accent/20 inline-flex items-center gap-0.5"
            title={`Navigate to ${code}`}
          >
            <span>{code}</span>
            <LinkIcon className="w-2.5 h-2.5 inline" />
          </Link>
        );
      }
      return (
        <code
          key={idx}
          className="font-mono text-xs px-1.5 py-0.5 rounded bg-subtle text-accent-ink border border-line"
        >
          {code}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      const bold = part.slice(2, -2);
      return (
        <strong key={idx} className="font-semibold text-ink">
          {bold}
        </strong>
      );
    }

    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const closeBracket = part.indexOf('](');
      const label = part.slice(1, closeBracket);
      const url = part.slice(closeBracket + 2, -1);
      const isInternal = url.startsWith('/');

      if (isInternal) {
        return (
          <Link
            key={idx}
            to={url}
            className="text-accent-ink font-medium hover:underline inline-flex items-center gap-0.5"
          >
            <span>{label}</span>
            <LinkIcon className="w-3 h-3 inline" />
          </Link>
        );
      }

      return (
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-ink font-medium hover:underline inline-flex items-center gap-0.5"
        >
          <span>{label}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }

    // Convert plain text route references like `/settings` into clickable links if found
    if (part.includes('/settings') || part.includes('/import')) {
      const words = part.split(/(\/settings|\/import)/g);
      return (
        <React.Fragment key={idx}>
          {words.map((w, wIdx) => {
            if (w === '/settings' || w === '/import') {
              return (
                <Link
                  key={wIdx}
                  to={w}
                  className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent-ink hover:underline border border-accent/20"
                >
                  {w}
                </Link>
              );
            }
            return w;
          })}
        </React.Fragment>
      );
    }

    return part;
  });
}

export const HelpAccordion: React.FC<HelpAccordionProps> = ({
  items,
  expandedItemId,
  onToggleItem,
  categoryLabel,
  categoryDescription,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-ink-muted border border-dashed border-line rounded-xl">
        <p className="text-ui-sm">No documentation questions match your search.</p>
        <p className="text-caption text-ink-faint mt-1">Try another keyword or select a category from the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categoryLabel && (
        <div className="pb-2 border-b border-line">
          <h2 className="text-lg font-semibold text-ink">{categoryLabel}</h2>
          {categoryDescription && (
            <p className="text-caption text-ink-muted mt-0.5">{categoryDescription}</p>
          )}
        </div>
      )}

      <div className="divide-y divide-line/60 rounded-xl border border-line bg-surface overflow-hidden shadow-xs">
        {items.map((item) => {
          const isOpen = expandedItemId === item.id;

          return (
            <div
              key={item.id}
              id={`help-item-${item.id}`}
              className={`transition-colors ${isOpen ? 'bg-subtle/40' : 'hover:bg-subtle/20'}`}
            >
              <button
                type="button"
                onClick={() => onToggleItem(item.id)}
                aria-expanded={isOpen}
                aria-controls={`help-answer-${item.id}`}
                className="w-full py-4 px-5 flex items-center justify-between gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-ui font-medium text-ink flex-1">{item.question}</span>
                <span className="p-1 rounded-md text-ink-muted shrink-0">
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-accent" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
              </button>

              {isOpen && (
                <div
                  id={`help-answer-${item.id}`}
                  className="px-5 pb-5 pt-1 border-t border-line/40 animate-fade-in"
                >
                  {renderFormattedAnswer(item.answer)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

