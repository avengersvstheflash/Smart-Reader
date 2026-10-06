import { useLocation } from 'react-router-dom';
import { useThemeStore } from '../../store/useThemeStore';
import { GradientWash } from './layers/GradientWash';
import { PatternTile } from './layers/PatternTile';
import { Scatter } from './layers/Scatter';
import { DECOR_REGISTRY } from './registry';

export function ThemeDecor() {
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const isReader = location.pathname.startsWith('/read/');

  // No decoration for themes without registered stickers yet
  if (!DECOR_REGISTRY[theme] || DECOR_REGISTRY[theme].length === 0) return null;

  return (
    <div
      className="theme-decor"
      data-reader-active={isReader || undefined}
      aria-hidden="true"
    >
      <GradientWash theme={theme} />
      <PatternTile theme={theme} />
      <Scatter theme={theme} />
    </div>
  );
}
