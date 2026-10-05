import { create } from 'zustand';
import { Theme } from '../types/domain';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const THEMES: Theme[] = ['spring', 'sakura', 'coffee', 'cyberpunk', 'omni'];

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('sr.theme');
  if (stored === 'dark')    return 'cyberpunk';
  if (stored === 'neon')    return 'omni';
  if (stored === 'warm')    return 'coffee';
  if (stored === 'glass')   return 'spring';
  if (stored === 'default') return 'sakura';
  if (stored && (THEMES as string[]).includes(stored)) return stored as Theme;
  return 'spring';
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = getInitialTheme();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initial);
  }

  return {
    theme: initial,
    setTheme: (theme) => {
      localStorage.setItem('sr.theme', theme);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      set({ theme });
    },
    cycleTheme: () => {
      set((state) => {
        const idx = THEMES.indexOf(state.theme);
        const next = THEMES[(idx + 1) % THEMES.length];
        localStorage.setItem('sr.theme', next);
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', next);
        }
        return { theme: next };
      });
    },
  };
});