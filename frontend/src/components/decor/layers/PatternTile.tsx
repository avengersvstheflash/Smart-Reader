export function PatternTile({ theme }: { theme: string }) {
  if (theme === 'spring') {
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

  if (theme === 'sakura') {
    return (
      <div
        className="decor-tile"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgb(var(--accent) / 0.05) 1px, transparent 1.5px)',
          backgroundSize: '36px 36px',
        }}
      />
    );
  }

  if (theme === 'coffee') {
    return (
      <div
        className="decor-tile"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(var(--accent) / 0.04) 0px, rgb(var(--accent) / 0.04) 1px, transparent 1px, transparent 12px)',
          backgroundSize: 'auto',
        }}
      />
    );
  }

  if (theme === 'cyberpunk') {
    return (
      <div
        className="decor-tile"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--accent) / 0.04) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent) / 0.04) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
    );
  }

  if (theme === 'omni') {
    return (
      <div
        className="decor-tile"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgb(var(--accent) / 0.05) 0.8px, transparent 1.2px)',
          backgroundSize: '28px 28px',
        }}
      />
    );
  }

  return null;
}
