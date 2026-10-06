import type React from 'react';

interface CherryBlossomProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CherryBlossom({ className, style }: CherryBlossomProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g transform="translate(12, 12)">
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <path
            key={i}
            d="M 0 0 C -3.5 -5, -4.5 -9, -2 -11 C 0 -10.5, 0 -10.5, 2 -11 C 4.5 -9, 3.5 -5, 0 0 Z"
            transform={`rotate(${angle})`}
          />
        ))}
        <circle cx="0" cy="0" r="1.5" opacity="0.75" />
      </g>
    </svg>
  );
}

