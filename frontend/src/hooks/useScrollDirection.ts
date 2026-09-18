import { useState, useEffect, useRef } from 'react';

export function useScrollDirection(options?: {
  threshold?: number;   // px of scroll delta before direction flips (default 8)
  topOffset?: number;   // always-show zone near top (default 64)
}): {
  direction: 'up' | 'down';
  isAtTop: boolean;
} {
  const threshold = options?.threshold ?? 8;
  const topOffset = options?.topOffset ?? 64;

  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [isAtTop, setIsAtTop] = useState<boolean>(true);

  const lastScrollYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize position
    const initialScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    lastScrollYRef.current = initialScrollY;
    setIsAtTop(initialScrollY < topOffset);

    function update() {
      rafIdRef.current = null;
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

      setIsAtTop(currentScrollY < topOffset);

      const delta = currentScrollY - lastScrollYRef.current;

      if (Math.abs(delta) >= threshold) {
        if (delta > 0 && currentScrollY > topOffset) {
          setDirection('down');
        } else if (delta < 0) {
          setDirection('up');
        }
        lastScrollYRef.current = currentScrollY;
      }
    }

    function onScroll() {
      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold, topOffset]);

  return { direction, isAtTop };
}

