import { create } from 'zustand';
import { getStoredFilters } from '../lib/libraryFilters';

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

const initialFilters = getStoredFilters();

export const useLibraryStore = create<LibraryState>((set) => ({
  searchQuery: initialFilters.searchQuery ?? '',
  filterType: initialFilters.filterType ?? 'all',
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
