import type React from 'react';

interface CyberSkullProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CyberSkull({ className, style }: CyberSkullProps) {
  return (
    <svg
      viewBox="0 0 24 28"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 12 3 L 16 3 L 20 1 L 18.5 6 L 22 10 L 20 18 L 16 26 L 8 26 L 4 18 L 2 10 L 5.5 6 L 4 1 L 8 3 Z M 6 12 L 10 14.5 L 9 16 L 5 13.5 Z M 18 12 L 14 14.5 L 15 16 L 19 13.5 Z M 11 19 L 13 19 L 12 21.5 Z"
      />
    </svg>
  );
}

