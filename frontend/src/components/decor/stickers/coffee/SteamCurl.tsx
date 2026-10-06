import type React from 'react';

interface SteamCurlProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SteamCurl({ className, style }: SteamCurlProps) {
  return (
    <svg
      viewBox="0 0 16 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M 4 21 C 2 16, 6 11, 4 5" />
      <path d="M 9 23 C 7 17, 11 12, 8 3" />
      <path d="M 13 20 C 11.5 16, 14.5 12, 13 6" />
    </svg>
  );
}

