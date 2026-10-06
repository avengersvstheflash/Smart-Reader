import katex from 'katex';
import { useMemo } from 'react';

interface MathRendererProps {
  latex: string;
  displayMode?: boolean;
}

export function MathRenderer({ latex, displayMode = false }: MathRendererProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'html',
      });
    } catch {
      return null;
    }
  }, [latex, displayMode]);

  if (!html) {
    return (
      <code className="math-error" title="Unrenderable math">
        {latex}
      </code>
    );
  }

  return (
    <span
      className={displayMode ? 'math-display' : 'math-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

