export const LIBRARY_FILTERS_KEY = 'library-filters-v1';

export interface StoredFilters {
  filterType?: string;
  selectedTags?: string[];
  searchQuery?: string;
}

export function getStoredFilters(): StoredFilters {
  try {
    const raw = sessionStorage.getItem(LIBRARY_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return {
      filterType: typeof parsed.filterType === 'string' ? parsed.filterType : undefined,
      selectedTags: Array.isArray(parsed.selectedTags)
        ? parsed.selectedTags.filter((t: unknown): t is string => typeof t === 'string')
        : undefined,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : undefined,
    };
  } catch {
    return {};
  }
}

export function persistFilters(filters: {
  filterType?: string;
  selectedTags?: string[];
  searchQuery?: string;
}): void {
  try {
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // silent fallback
  }
}
