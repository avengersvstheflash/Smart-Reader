import type React from 'react';

interface BrainOutlineProps {
  className?: string;
  style?: React.CSSProperties;
}

export function BrainOutline({ className, style }: BrainOutlineProps) {
  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 14 4 C 11 2 6 3 4 8 C 2 12 3 16 7 19 C 10 21 13 21 14 20 C 15 21 18 21 21 19 C 25 16 26 12 24 8 C 22 3 17 2 14 4 Z" />
      <path d="M 14 4 C 13.5 9 14.5 15 14 20" />
      <path d="M 7 10 C 10 11 11 9 13 11" strokeWidth="1" />
      <path d="M 21 10 C 18 11 17 9 15 11" strokeWidth="1" />
      <path d="M 8 15 C 10 16 12 15 13 16" strokeWidth="1" />
      <path d="M 20 15 C 18 16 16 15 15 16" strokeWidth="1" />
    </svg>
  );
}

