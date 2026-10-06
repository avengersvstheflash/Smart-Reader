import type React from 'react';

interface CosmosDotProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CosmosDot({ className, style }: CosmosDotProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <path
        d="M 8 1.5 L 8 4 M 8 12 L 8 14.5 M 1.5 8 L 4 8 M 12 8 L 14.5 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

