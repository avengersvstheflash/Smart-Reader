import { create } from 'zustand';

export type ModalName =
  | 'deleteBook'
  | 'addChapter';

export interface ModalStore {
  active: { name: ModalName; props: Record<string, unknown> } | null;
  open: (name: ModalName, props?: Record<string, unknown>) => void;
  close: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  active: null,
  open: (name, props = {}) => set({ active: { name, props } }),
  close: () => set({ active: null }),
}));

export function useModal() {
  return {
    open: useModalStore((s) => s.open),
    close: useModalStore((s) => s.close),
  };
}
