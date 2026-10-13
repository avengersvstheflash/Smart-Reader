import React from 'react';
import { BookOpen, Compass, Upload, FileText, AlertCircle } from 'lucide-react';

export interface HelpItemData {
  id: string;
  question: string;
  answer: string;
}

export interface HelpCategoryData {
  id: string;
  label: string;
  icon: string;
  description: string;
  items: HelpItemData[];
}

interface HelpSidebarProps {
  categories: HelpCategoryData[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  isSearching: boolean;
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  BookOpen,
  Compass,
  Upload,
  FileText,
  AlertCircle,
};

export const HelpSidebar: React.FC<HelpSidebarProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  isSearching,
}) => {
  return (
    <nav className="space-y-1.5" aria-label="Help categories">
      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.icon] || BookOpen;
        const isActive = !isSearching && activeCategoryId === cat.id;

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-ui-sm font-medium transition-all text-left ${
              isActive
                ? 'bg-accent/15 text-accent-ink font-semibold shadow-xs border border-accent/30'
                : 'text-ink-muted hover:text-ink hover:bg-subtle border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-ink-muted'}`} />
              <span className="truncate">{cat.label}</span>
            </div>
            <span
              className={`text-micro px-1.5 py-0.5 rounded-full font-mono shrink-0 ${
                isActive
                  ? 'bg-accent/20 text-accent-ink font-semibold'
                  : 'bg-subtle text-ink-faint'
              }`}
            >
              {cat.items.length}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

