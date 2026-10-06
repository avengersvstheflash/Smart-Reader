import type React from 'react';

interface LeafProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Leaf({ className, style }: LeafProps) {
  return (
    <svg
      viewBox="0 0 20 28"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M10.5 2 C17 8, 17.5 18, 10.5 24 Z M9.5 2 C2.5 8, 2 18, 9.5 24 Z"
        fill="currentColor"
      />
      <path
        d="M10 22 L10 27"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

