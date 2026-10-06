import type React from 'react';

interface OrbitRingProps {
  className?: string;
  style?: React.CSSProperties;
}

export function OrbitRing({ className, style }: OrbitRingProps) {
  return (
    <svg
      viewBox="0 0 36 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <ellipse
        cx="18"
        cy="12"
        rx="16"
        ry="9"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="34" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

