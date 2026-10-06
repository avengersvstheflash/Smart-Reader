import type React from 'react';

interface CoffeeBeanProps {
  className?: string;
  style?: React.CSSProperties;
}

export function CoffeeBean({ className, style }: CoffeeBeanProps) {
  return (
    <svg
      viewBox="0 0 16 20"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Left bean half */}
      <path d="M 7 2.5 C 2.8 3, 1.5 6.5, 1.5 10 C 1.5 13.5, 2.8 17, 7 17.5 C 5.3 13.5, 8.7 6.5, 7 2.5 Z" />
      {/* Right bean half */}
      <path d="M 9 2.5 C 13.2 3, 14.5 6.5, 14.5 10 C 14.5 13.5, 13.2 17, 9 17.5 C 7.3 13.5, 10.7 6.5, 9 2.5 Z" />
    </svg>
  );
}

