export function GradientWash({ theme }: { theme: string }) {
  if (theme === 'spring') {
    return (
      <div
        className="decor-wash"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 15% 20%, rgb(45 168 152 / 0.06), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 80%, rgb(110 231 183 / 0.05), transparent 70%)',
        }}
      />
    );
  }

  if (theme === 'sakura') {
    return (
      <div
        className="decor-wash"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 85% 15%, rgb(236 72 153 / 0.06), transparent 70%), radial-gradient(ellipse 50% 40% at 10% 80%, rgb(251 113 133 / 0.05), transparent 70%)',
        }}
      />
    );
  }

  if (theme === 'coffee') {
    return (
      <div
        className="decor-wash"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 15% 25%, rgb(180 83 9 / 0.05), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 75%, rgb(217 119 6 / 0.04), transparent 70%)',
        }}
      />
    );
  }

  if (theme === 'cyberpunk') {
    return (
      <div
        className="decor-wash"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 50% 40% at 85% 15%, rgb(0 216 230 / 0.06), transparent 70%), radial-gradient(ellipse 50% 40% at 15% 85%, rgb(255 82 217 / 0.05), transparent 70%)',
        }}
      />
    );
  }

  return null;
}
