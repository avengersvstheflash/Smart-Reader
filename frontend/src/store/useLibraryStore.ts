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

const STORAGE_KEY = 'library-filters-v1';

function getStoredFilters(): { searchQuery?: string; filterType?: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return {
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : undefined,
      filterType: typeof parsed.filterType === 'string' ? parsed.filterType : undefined,
    };
  } catch {
    return {};
  }
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