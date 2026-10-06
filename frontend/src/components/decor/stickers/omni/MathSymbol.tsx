import type React from 'react';

interface MathSymbolProps {
  className?: string;
  style?: React.CSSProperties;
  glyph: string;
}

export function MathSymbol({ className, style, glyph }: MathSymbolProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontSize="24"
        fontFamily="Georgia, 'Times New Roman', serif"
        fill="currentColor"
      >
        {glyph}
      </text>
    </svg>
  );
}

