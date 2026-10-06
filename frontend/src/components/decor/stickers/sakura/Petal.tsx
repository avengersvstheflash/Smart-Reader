import type React from 'react';

interface PetalProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Petal({ className, style }: PetalProps) {
  return (
    <svg
      viewBox="0 0 18 14"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 9 2.5 C 7.5 1, 5.5 0.5, 4 1.2 C 1.8 2.4, 0.5 5, 1 8 C 1.5 11, 4.5 13, 9 13 C 13.5 13, 16.5 11, 17 8 C 17.5 5, 16.2 2.4, 14 1.2 C 12.5 0.5, 10.5 1, 9 2.5 Z" />
    </svg>
  );
}
