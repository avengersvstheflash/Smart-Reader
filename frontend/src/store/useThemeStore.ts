import { create } from 'zustand';
import { Theme } from '../types/domain';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const THEMES: Theme[] = ['default', 'warm', 'dark', 'glass', 'omni'];

function getInitialTheme(): Theme {
  // Migration: 'neon' -> 'omni'
  const stored = localStorage.getItem('sr.theme') as string | null;
  if (stored === 'neon') return 'omni';
  if (stored && (THEMES as string[]).includes(stored)) return stored as Theme;
  return 'default';
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