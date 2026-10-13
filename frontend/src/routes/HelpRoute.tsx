import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, HelpCircle } from 'lucide-react';
import helpData from '../content/help.json';
import { HelpPills, QuickQuestion } from '../components/help/HelpPills';
import { HelpSidebar, HelpCategoryData, HelpItemData } from '../components/help/HelpSidebar';
import { HelpAccordion } from '../components/help/HelpAccordion';

export const HelpRoute: React.FC = () => {
  const categories = helpData.categories as HelpCategoryData[];
  const quickQuestions = helpData.quickQuestions as QuickQuestion[];

  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id || 'getting-started');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === activeCategoryId) || categories[0];
  }, [categories, activeCategoryId]);

  // Filter items across all categories if searching, or active category otherwise
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return activeCategory ? activeCategory.items : [];
    }

    const matched: HelpItemData[] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        if (
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q)
        ) {
          matched.push(item);
        }
      }
    }
    return matched;
  }, [categories, activeCategory, searchQuery]);

  // When searching, expand first match if closed
  useEffect(() => {
    if (searchQuery.trim().length > 0 && filteredItems.length > 0) {
      setExpandedItemId(filteredItems[0].id);
    }
  }, [searchQuery, filteredItems]);

  const handleSelectQuickQuestion = (categoryId: string, itemId: string) => {
    setSearchQuery('');
    setActiveCategoryId(categoryId);
    setExpandedItemId(itemId);

    // Scroll to item after state update
    setTimeout(() => {
      const el = document.getElementById(`help-item-${itemId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleToggleItem = (itemId: string) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 text-accent mb-2">
          <HelpCircle className="w-6 h-6" />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">User Guide & Reference</span>
        </div>
        <h1 className="text-3xl font-display font-semibold text-ink">Documentation & Help</h1>
        <p className="text-ui text-ink-muted mt-1 max-w-2xl">
          Everything you need to master Omnitome's neural reader, research dossiers, and local ingestion pipeline.
        </p>
      </div>

      {/* Top Quick-Question Jumping Pills */}
      <HelpPills questions={quickQuestions} onSelect={handleSelectQuickQuestion} />

      {/* Search Bar */}
      <div className="mb-8 relative max-w-xl">
        <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documentation, shortcuts, error codes..."
          className="w-full pl-10 pr-9 py-2.5 bg-surface rounded-xl border border-line text-ui-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all shadow-xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Category Sidebar */}
        <div className="md:col-span-4 lg:col-span-3">
          <div className="sticky top-20 bg-surface/80 rounded-xl border border-line p-3 shadow-xs">
            <div className="px-3 py-2 text-micro uppercase tracking-wider text-ink-muted font-semibold">
              Categories
            </div>
            <HelpSidebar
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelectCategory={(id) => {
                setSearchQuery('');
                setActiveCategoryId(id);
                setExpandedItemId(null);
              }}
              isSearching={Boolean(searchQuery.trim())}
            />
          </div>
        </div>

        {/* Right Column: Content Pane */}
        <div className="md:col-span-8 lg:col-span-9">
          <HelpAccordion
            items={filteredItems}
            expandedItemId={expandedItemId}
            onToggleItem={handleToggleItem}
            categoryLabel={searchQuery.trim() ? `Search Results (${filteredItems.length})` : activeCategory?.label}
            categoryDescription={searchQuery.trim() ? `Matching "${searchQuery}" across all categories` : activeCategory?.description}
          />
        </div>
      </div>
    </div>
  );
};

export default HelpRoute;

