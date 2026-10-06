export function GradientWash({ theme }: { theme: string }) {
  if (theme !== 'spring') return null;

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

