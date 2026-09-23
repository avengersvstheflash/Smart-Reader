import { useState, useEffect } from 'react';

/**
 * Returns true when prefers-reduced-motion: reduce is active.
 * Listens for system changes and cleans up on unmount.
 * SSR-safe: returns false when window is undefined.
 */
export function useReducedMotion(): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', onChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(onChange);
    }

    setMatches(mediaQuery.matches);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', onChange);
      } else {
        mediaQuery.removeListener(onChange);
      }
    };
  }, []);

  return matches;
}

export default useReducedMotion;

