import React, { useEffect, useRef } from 'react';

export function ScrollProgress({
  container = 'window',
  height = 2,
  tone = 'accent',
}: {
  container?: 'window' | React.RefObject<HTMLElement>;
  height?: number;
  tone?: 'accent' | 'brand';
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;

    function update() {
      rafId = null;
      let scrollY = 0;
      let scrollHeight = 0;
      let clientHeight = 0;

      if (container === 'window') {
        scrollY = window.scrollY || document.documentElement.scrollTop;
        scrollHeight = document.documentElement.scrollHeight;
        clientHeight = document.documentElement.clientHeight;
      } else if (container.current) {
        const el = container.current;
        scrollY = el.scrollTop;
        scrollHeight = el.scrollHeight;
        clientHeight = el.clientHeight;
      }

      const maxScroll = scrollHeight - clientHeight;
      const isScrollable = maxScroll > 0;

      if (wrapperRef.current) {
        wrapperRef.current.style.display = isScrollable ? 'block' : 'none';
      }

      if (barRef.current) {
        const pct = isScrollable
          ? Math.min(100, Math.max(0, (scrollY / maxScroll) * 100))
          : 0;
        barRef.current.style.width = `${pct}%`;
      }
    }

    function onScroll() {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(update);
      }
    }

    // Initial update
    update();

    let target: EventTarget | null = null;
    if (container === 'window') {
      target = window;
    } else if (container.current) {
      target = container.current;
    }

    if (target) {
      target.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (target) {
        target.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('resize', onScroll);
    };
  }, [container]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ height: `${height}px`, display: 'none' }}
    >
      <div
        ref={barRef}
        className={`h-full ${tone === 'accent' ? 'bg-accent' : 'bg-brand'}`}
        style={{ width: '0%', transition: 'none' }}
      />
    </div>
  );
}
