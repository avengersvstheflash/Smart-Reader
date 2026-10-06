import type React from 'react';

interface CroissantProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Croissant({ className, style }: CroissantProps) {
  return (
    <svg
      viewBox="0 0 28 16"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Center pastry segment */}
      <path d="M 11 4 C 13 3.5, 15 3.5, 17 4 C 18 8, 17.5 12, 16.5 14 C 14.8 14.5, 13.2 14.5, 11.5 14 C 10.5 12, 10 8, 11 4 Z" />
      {/* Left tapered wing */}
      <path d="M 9.5 5 C 6 6.5, 3 9.5, 2.5 12.5 C 4.5 13.8, 8 13.5, 9.8 13 C 9 10, 8.8 7.5, 9.5 5 Z" />
      {/* Right tapered wing */}
      <path d="M 18.5 5 C 22 6.5, 25 9.5, 25.5 12.5 C 23.5 13.8, 20 13.5, 18.2 13 C 19 10, 19.2 7.5, 18.5 5 Z" />
    </svg>
  );
}

