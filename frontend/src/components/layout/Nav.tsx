import React from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Compass, Upload, LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
}

export interface NavProps {
  items?: NavItem[];
  orientation?: 'horizontal' | 'vertical';
}

const DEFAULT_ITEMS: NavItem[] = [
  { to: '/', label: 'Library', icon: BookOpen, end: true },
  { to: '/research', label: 'Research', icon: Compass },
  { to: '/import', label: 'Import', icon: Upload },
];

export const Nav: React.FC<NavProps> = ({ items = DEFAULT_ITEMS }) => {
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 border-b border-line bg-card/60 backdrop-blur px-4 md:px-6"
    >
      <div className="max-w-6xl mx-auto w-full flex items-center gap-2 h-11 overflow-x-auto scrollbar-none">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-ui-sm font-medium transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive
                    ? 'bg-subtle text-ink font-semibold border border-line-strong'
                    : 'text-ink-muted hover:text-ink hover:bg-subtle/50'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
              {typeof item.badge === 'number' && (
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-subtle text-ink-light font-mono">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};