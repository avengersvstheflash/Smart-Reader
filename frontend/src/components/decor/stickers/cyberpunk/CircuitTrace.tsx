import type React from 'react';

interface CircuitTraceProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CircuitTrace({ className, style }: CircuitTraceProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 4 6 L 16 6 L 24 18 L 24 30 L 32 30" />
      <path d="M 16 6 L 16 14 L 8 22" />
      <circle cx="4" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="22" r="2" fill="currentColor" stroke="none" />
      <circle cx="32" cy="30" r="2" fill="currentColor" stroke="none" />
      <circle cx="24" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

