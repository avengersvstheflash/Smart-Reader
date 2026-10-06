import type React from 'react';

interface BlossomBudProps {
  className?: string;
  style?: React.CSSProperties;
}

export function BlossomBud({ className, style }: BlossomBudProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 6 1 C 9 3, 11 6, 10 9 C 9 11.5, 3 11.5, 2 9 C 1 6, 3 3, 6 1 Z" />
      <circle cx="6" cy="1.2" r="0.8" opacity="0.6" />
    </svg>
  );
}

