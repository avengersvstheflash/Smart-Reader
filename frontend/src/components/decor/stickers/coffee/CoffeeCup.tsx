import type React from 'react';

interface CoffeeCupProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CoffeeCup({ className, style }: CoffeeCupProps) {
  return (
    <svg
      viewBox="0 0 24 20"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Cup body */}
      <path d="M 4 5 L 17 5 C 17 12.5, 14.5 15.5, 10.5 15.5 C 6.5 15.5, 4 12.5, 4 5 Z" />
      {/* Handle */}
      <path
        d="M 16.5 7.5 C 20 7.5, 20.5 12.5, 16 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Saucer */}
      <path
        d="M 2.5 17.5 C 5.5 19, 15.5 19, 18.5 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

