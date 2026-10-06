import type React from 'react';

interface HazardStripeProps {
  className?: string;
  style?: React.CSSProperties;
}

export function HazardStripe({ className, style }: HazardStripeProps) {
  return (
    <svg
      viewBox="0 0 40 16"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <polygon points="0,16 6,0 11,0 5,16" />
      <polygon points="10,16 16,0 21,0 15,16" />
      <polygon points="20,16 26,0 31,0 25,16" />
      <polygon points="30,16 36,0 41,0 35,16" />
    </svg>
  );
}

