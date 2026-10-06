export function PatternTile({ theme }: { theme: string }) {
  if (theme !== 'spring') return null;

  return (
    <div
      className="decor-tile"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgb(var(--accent) / 0.06) 1px, transparent 1.5px)',
        backgroundSize: '32px 32px',
      }}
    />
  );
}

