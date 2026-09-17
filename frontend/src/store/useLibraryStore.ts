import { create } from 'zustand';

interface LibraryState {
  searchQuery: string;
  filterType: string;
  selectionMode: boolean;
  selectedBookIds: string[];
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: string) => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleBookSelection: (id: string) => void;
  clearSelection: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  searchQuery: '',
  filterType: 'all',
  selectionMode: false,
  selectedBookIds: [],
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilterType: (filterType) => set({ filterType }),
  setSelectionMode: (selectionMode) => set({ selectionMode, selectedBookIds: [] }),
  toggleBookSelection: (id) =>
    set((state) => ({
      selectedBookIds: state.selectedBookIds.includes(id)
        ? state.selectedBookIds.filter((item) => item !== id)
        : [...state.selectedBookIds, id],
    })),
  clearSelection: () => set({ selectedBookIds: [] }),
}));