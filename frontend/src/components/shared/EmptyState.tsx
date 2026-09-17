import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  ghostAction?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  body,
  action,
  ghostAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 max-w-md mx-auto">
      <div className="p-3.5 rounded-full bg-subtle text-ink-light mb-4">
        <Icon className="w-8 h-8 text-faint stroke-[1.5]" aria-hidden="true" />
      </div>
      <h2 className="text-h2 font-semibold text-ink mb-2">{title}</h2>
      {body && <p className="text-body text-ink-muted mb-6 text-sm">{body}</p>}
      {(action || ghostAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {action.label}
            </button>
          )}
          {ghostAction && (
            <button
              type="button"
              onClick={ghostAction.onClick}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border border-line bg-transparent text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {ghostAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};