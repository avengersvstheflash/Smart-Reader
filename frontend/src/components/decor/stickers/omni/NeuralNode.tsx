import type React from 'react';

interface NeuralNodeProps {
  className?: string;
  style?: React.CSSProperties;
}

export function NeuralNode({ className, style }: NeuralNodeProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="26" y2="8" stroke="currentColor" strokeWidth="0.8" />
      <line x1="6" y1="6" x2="10" y2="26" stroke="currentColor" strokeWidth="0.8" />
      <line x1="26" y1="8" x2="26" y2="26" stroke="currentColor" strokeWidth="0.8" />
      <line x1="10" y1="26" x2="26" y2="26" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="26" cy="8" r="2" fill="currentColor" />
      <circle cx="10" cy="26" r="2" fill="currentColor" />
      <circle cx="26" cy="26" r="2" fill="currentColor" />
    </svg>
  );
}

