import type React from 'react';

interface DataShardProps {
  className?: string;
  style?: React.CSSProperties;
}

export function DataShard({ className, style }: DataShardProps) {
  return (
    <svg
      viewBox="0 0 22 26"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 4 2 L 15 2 L 18 5 L 18 24 L 4 24 L 4 15 L 7 13 L 4 11 Z M 8 5 H 15 V 7 H 8 Z M 8 9 H 15 V 10.5 H 8 Z M 8 18 H 14 V 21 H 8 Z"
      />
    </svg>
  );
}

