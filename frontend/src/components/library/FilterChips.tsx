import React from 'react';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  size?: 'sm' | 'md';
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  options,
  value,
  onChange,
  multiple = false,
  size = 'sm',
}) => {
  const isSelected = (val: string) => {
    if (multiple && Array.isArray(value)) {
      return value.includes(val);
    }
    return value === val;
  };

  const handleClick = (val: string) => {
    if (multiple) {
      const arr = Array.isArray(value) ? [...value] : [];
      if (arr.includes(val)) {
        onChange(arr.filter((v) => v !== val));
      } else {
        onChange([...arr, val]);
      }
    } else {
      onChange(val);
    }
  };

  const sizeClasses =
    size === 'md'
      ? 'h-9 px-3.5 text-ui-sm gap-1.5'
      : 'h-7 md:h-8 px-2.5 text-xs gap-1';

  return (
    <div
      role="toolbar"
      aria-label="Filter content"
      className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none min-h-[44px]"
    >
      {options.map((opt) => {
        const active = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => handleClick(opt.value)}
            className={`inline-flex items-center rounded-full font-medium transition-all whitespace-nowrap select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sizeClasses} ${
              active
                ? 'bg-brand text-white border-brand shadow-sm'
                : 'bg-card text-ink-muted border-line hover:bg-subtle hover:text-ink hover:border-line-strong'
            }`}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  active ? 'bg-white/20 text-white' : 'bg-subtle text-ink-light'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};