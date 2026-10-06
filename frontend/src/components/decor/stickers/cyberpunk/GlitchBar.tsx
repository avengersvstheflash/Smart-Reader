import type React from 'react';

interface GlitchBarProps {
  className?: string;
  style?: React.CSSProperties;
}

export function GlitchBar({ className, style }: GlitchBarProps) {
  return (
    <svg
      viewBox="0 0 44 10"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="2" y="1" width="32" height="2" />
      <rect x="8" y="4.5" width="34" height="2" />
      <rect x="4" y="8" width="22" height="1.5" />
      <rect x="30" y="8" width="6" height="1.5" />
    </svg>
  );
}

