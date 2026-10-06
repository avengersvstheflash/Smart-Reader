import type React from 'react';

interface GrassTuftProps {
  className?: string;
  style?: React.CSSProperties;
}

export function GrassTuft({ className, style }: GrassTuftProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M11 23 C11 16, 7 8, 3 6 C6 10, 11 17, 12 23 Z" />
      <path d="M11.5 23 C11.5 14, 11 7, 12 2 C13 7, 12.5 14, 12.5 23 Z" />
      <path d="M12 23 C13 17, 18 10, 21 7 C17 9, 13 16, 13 23 Z" />
    </svg>
  );
}

