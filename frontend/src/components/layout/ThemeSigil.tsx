import { useThemeStore } from '../../store/useThemeStore';
import { Leaf } from '../decor/stickers/spring/Leaf';
import { CherryBlossom } from '../decor/stickers/sakura/CherryBlossom';
import { Petal } from '../decor/stickers/sakura/Petal';
import { CoffeeCup } from '../decor/stickers/coffee/CoffeeCup';
import { SteamCurl } from '../decor/stickers/coffee/SteamCurl';
import { CircuitTrace } from '../decor/stickers/cyberpunk/CircuitTrace';

export function ThemeSigil() {
  const theme = useThemeStore((s) => s.theme);

  if (theme === 'spring') {
    return (
      <span key={theme} className="theme-sigil theme-sigil-spring" aria-hidden="true">
        <Leaf className="sigil-main" />
      </span>
    );
  }

  if (theme === 'sakura') {
    return (
      <span key={theme} className="theme-sigil theme-sigil-sakura" aria-hidden="true">
        <CherryBlossom className="sigil-main" />
        <Petal className="sigil-petal sigil-petal-a" />
        <Petal className="sigil-petal sigil-petal-b" />
      </span>
    );
  }

  if (theme === 'coffee') {
    return (
      <span key={theme} className="theme-sigil theme-sigil-coffee" aria-hidden="true">
        <CoffeeCup className="sigil-main" />
        <SteamCurl className="sigil-steam sigil-steam-a" />
        <SteamCurl className="sigil-steam sigil-steam-b" />
      </span>
    );
  }

  if (theme === 'cyberpunk') {
    return (
      <span key={theme} className="theme-sigil theme-sigil-cyberpunk" aria-hidden="true">
        <CircuitTrace className="sigil-main" />
      </span>
    );
  }

  return null; // omni uses arcane sigil from Header.tsx
}

