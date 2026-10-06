import { useThemeStore } from '../../store/useThemeStore';

export function ButtonDecor() {
  const theme = useThemeStore((s) => s.theme);

  if (theme === 'spring') {
    return (
      <span className="btn-decor btn-decor-spring" aria-hidden="true">
        <span className="btn-ripple btn-ripple-a" />
        <span className="btn-ripple btn-ripple-b" />
        <span className="btn-ripple btn-ripple-c" />
      </span>
    );
  }

  if (theme === 'sakura') {
    return (
      <span className="btn-decor btn-decor-sakura" aria-hidden="true">
        <svg className="btn-petal btn-petal-a" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 1.5C4.8 0.8 3.2 1.2 2.6 2.4 2 3.6 2.6 5 3.6 5.8 2.8 6.8 2.6 8.2 3.4 9.2 4.2 10.2 5.6 10.4 6.6 9.8 7.6 10.4 9 10.2 9.8 9.2 10.6 8.2 10.4 6.8 9.6 5.8 10.6 5 11.2 3.6 10.6 2.4 10 1.2 8.4 0.8 7.2 1.5 6.8 1.6 6.4 1.6 6 1.5Z" />
        </svg>
        <svg className="btn-petal btn-petal-b" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 1.5C4.8 0.8 3.2 1.2 2.6 2.4 2 3.6 2.6 5 3.6 5.8 2.8 6.8 2.6 8.2 3.4 9.2 4.2 10.2 5.6 10.4 6.6 9.8 7.6 10.4 9 10.2 9.8 9.2 10.6 8.2 10.4 6.8 9.6 5.8 10.6 5 11.2 3.6 10.6 2.4 10 1.2 8.4 0.8 7.2 1.5 6.8 1.6 6.4 1.6 6 1.5Z" />
        </svg>
        <svg className="btn-petal btn-petal-c" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 1.5C4.8 0.8 3.2 1.2 2.6 2.4 2 3.6 2.6 5 3.6 5.8 2.8 6.8 2.6 8.2 3.4 9.2 4.2 10.2 5.6 10.4 6.6 9.8 7.6 10.4 9 10.2 9.8 9.2 10.6 8.2 10.4 6.8 9.6 5.8 10.6 5 11.2 3.6 10.6 2.4 10 1.2 8.4 0.8 7.2 1.5 6.8 1.6 6.4 1.6 6 1.5Z" />
        </svg>
      </span>
    );
  }

  if (theme === 'coffee') {
    return (
      <span className="btn-decor btn-decor-coffee" aria-hidden="true">
        <svg className="btn-steam btn-steam-a" viewBox="0 0 8 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 18 C 1 14, 7 10, 4 6 C 1 2, 4 0, 4 0" />
        </svg>
        <svg className="btn-steam btn-steam-b" viewBox="0 0 8 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 18 C 1 14, 7 10, 4 6 C 1 2, 4 0, 4 0" />
        </svg>
        <svg className="btn-steam btn-steam-c" viewBox="0 0 8 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 18 C 1 14, 7 10, 4 6 C 1 2, 4 0, 4 0" />
        </svg>
      </span>
    );
  }

  if (theme === 'omni') {
    return (
      <span className="btn-decor btn-decor-omni" aria-hidden="true">
        {/* Drifting cosmos dust */}
        <span className="btn-cosmos btn-cosmos-a" />
        <span className="btn-cosmos btn-cosmos-b" />
        <span className="btn-cosmos btn-cosmos-c" />
        <span className="btn-cosmos btn-cosmos-d" />
        {/* Faint rotating arcane glyph behind the label */}
        <svg
          className="btn-arcane-glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        >
          {/* Simplified ∑-like rune */}
          <path d="M6 5 L18 5 M6 5 L6 19 M6 19 L18 19 M6 12 L14 12" />
          {/* Small orbital dot */}
          <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }

  // cyberpunk uses its own surface animations
  return null;
}

