import type React from 'react';

interface BranchProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Branch({ className, style }: BranchProps) {
  return (
    <svg
      viewBox="0 0 48 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 2 12 Q 16 4, 30 9 T 46 4" />
      <path d="M 20 8 Q 24 5, 27 3" />
      <circle cx="27" cy="3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="46" cy="4" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

