export {};
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReaderState {
  repModeByBook: Record<string, 'original' | 'smart'>;
  fontSize: number;
  align: 'left' | 'justify';
  getMode: (bookId: string) => 'original' | 'smart';
  setMode: (bookId: string, mode: 'original' | 'smart') => void;
  setFontSize: (px: number) => void;
  setAlign: (a: 'left' | 'justify') => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      repModeByBook: {},
      fontSize: 18,
      align: 'left',

      getMode: (bookId: string) => {
        return get().repModeByBook[bookId] || 'original';
      },

      setMode: (bookId: string, mode: 'original' | 'smart') => {
        set((state) => ({
          repModeByBook: {
            ...state.repModeByBook,
            [bookId]: mode,
          },
        }));
      },

      setFontSize: (px: number) => {
        const clamped = Math.min(22, Math.max(16, px));
        set({ fontSize: clamped });
      },

      setAlign: (align: 'left' | 'justify') => {
        set({ align });
      },
    }),
    {
      name: 'sr.reader.prefs',
    }
  )
);
