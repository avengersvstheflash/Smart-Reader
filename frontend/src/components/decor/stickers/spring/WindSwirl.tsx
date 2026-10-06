import type React from 'react';

interface WindSwirlProps {
  className?: string;
  style?: React.CSSProperties;
}

export function WindSwirl({ className, style }: WindSwirlProps) {
  return (
    <svg
      viewBox="0 0 32 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M2 10 C10 10, 18 6, 24 6 C28 6, 30 9, 27 12 C24 15, 19 12, 21 8" />
      <path d="M6 16 C12 16, 17 14, 21 14 C24 14, 26 16, 24 18 C22 20, 18 18, 19 15" />
      <path d="M1 21 C6 21, 10 20, 15 20" />
    </svg>
  );
}

