import type React from 'react';

interface GlintProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Glint({ className, style }: GlintProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 10 1 Q 10 10 19 10 Q 10 10 10 19 Q 10 10 1 10 Q 10 10 10 1 Z" />
    </svg>
  );
}

