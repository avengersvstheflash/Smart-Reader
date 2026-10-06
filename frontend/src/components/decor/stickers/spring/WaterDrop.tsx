import type React from 'react';

interface WaterDropProps {
  className?: string;
  style?: React.CSSProperties;
}

export function WaterDrop({ className, style }: WaterDropProps) {
  return (
    <svg
      viewBox="0 0 20 28"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M10 0 C 4 10, 0 16, 0 20 a 10 10 0 0 0 20 0 C 20 16, 16 10, 10 0 Z" />
    </svg>
  );
}

