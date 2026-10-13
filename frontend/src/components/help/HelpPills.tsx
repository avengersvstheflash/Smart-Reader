import React from 'react';
import { HelpCircle } from 'lucide-react';

export interface QuickQuestion {
  id: string;
  label: string;
  categoryId: string;
  itemId: string;
}

interface HelpPillsProps {
  questions: QuickQuestion[];
  onSelect: (categoryId: string, itemId: string) => void;
}

export const HelpPills: React.FC<HelpPillsProps> = ({ questions, onSelect }) => {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5 text-caption text-ink-muted">
        <HelpCircle className="w-4 h-4 text-accent" />
        <span className="font-medium text-ink">Popular Quick Jumps</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelect(q.categoryId, q.itemId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-line bg-surface hover:border-accent/60 hover:text-accent-ink hover:bg-subtle transition-all active:scale-95 text-ink-muted cursor-pointer shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>{q.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

