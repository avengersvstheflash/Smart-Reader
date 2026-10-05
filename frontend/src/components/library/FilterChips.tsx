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

function getChipStyle(label: string, value: string, active: boolean): string {
  const l = label.toLowerCase();
  const v = value.toLowerCase();

  // PDF pill: hover:border-[rgb(var(--neon-red)/0.6)] text-[rgb(var(--neon-red))] (active: bg-[rgb(var(--neon-red)/0.2)])
  if (v === 'pdf') {
    return active
      ? 'bg-[rgb(var(--neon-red)/0.2)] text-[rgb(var(--neon-red))] border-[rgb(var(--neon-red)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--neon-red))] border-line hover:border-[rgb(var(--neon-red)/0.6)] hover:bg-subtle';
  }

  // EPUB pill: hover:border-[rgb(var(--accent-2)/0.6)] text-[rgb(var(--accent-2))] (active: bg-[rgb(var(--accent-2)/0.2)])
  if (v === 'epub') {
    return active
      ? 'bg-[rgb(var(--accent-2)/0.2)] text-[rgb(var(--accent-2))] border-[rgb(var(--accent-2)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-2))] border-line hover:border-[rgb(var(--accent-2)/0.6)] hover:bg-subtle';
  }

  // Web pill: hover:border-[rgb(var(--accent)/0.6)] text-[rgb(var(--accent))] (active: bg-[rgb(var(--accent)/0.2)])
  if (v === 'web' || l.includes('web')) {
    return active
      ? 'bg-[rgb(var(--accent)/0.2)] text-[rgb(var(--accent))] border-[rgb(var(--accent)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent))] border-line hover:border-[rgb(var(--accent)/0.6)] hover:bg-subtle';
  }

  // Pasted/Text pill: hover:border-[rgb(var(--accent-3)/0.6)] text-[rgb(var(--accent-3))] (active: bg-[rgb(var(--accent-3)/0.2)])
  if (v === 'paste' || v === 'text' || l.includes('paste')) {
    return active
      ? 'bg-[rgb(var(--accent-3)/0.2)] text-[rgb(var(--accent-3))] border-[rgb(var(--accent-3)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-3))] border-line hover:border-[rgb(var(--accent-3)/0.6)] hover:bg-subtle';
  }

  // Dossiers pill (Laser Magenta)
  if (v === 'dossier') {
    return active
      ? 'bg-[rgb(var(--accent-2)/0.2)] text-[rgb(var(--accent-2))] border-[rgb(var(--accent-2)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-2))] border-line hover:border-[rgb(var(--accent-2)/0.6)] hover:bg-subtle';
  }

  // Single Items pill (Hyper Lime)
  if (v === 'single') {
    return active
      ? 'bg-[rgb(var(--accent-3)/0.2)] text-[rgb(var(--accent-3))] border-[rgb(var(--accent-3)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-3))] border-line hover:border-[rgb(var(--accent-3)/0.6)] hover:bg-subtle';
  }

  // Novel pill
  if (l.includes('novel') || v === 'novel') {
    return active
      ? 'bg-[rgb(var(--accent-2)/0.2)] text-[rgb(var(--accent-2))] border-[rgb(var(--accent-2)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-2))] border-line hover:border-[rgb(var(--accent-2)/0.6)] hover:bg-subtle';
  }

  // Doc pill
  if (l.includes('doc') || v === 'document') {
    return active
      ? 'bg-[rgb(var(--accent-3)/0.2)] text-[rgb(var(--accent-3))] border-[rgb(var(--accent-3)/0.6)] shadow-xs'
      : 'bg-card text-[rgb(var(--accent-3))] border-line hover:border-[rgb(var(--accent-3)/0.6)] hover:bg-subtle';
  }

  // "All" pills: electric cyan outline with soft wash rather than flat opaque fill
  return active
    ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent-ink))] shadow-xs'
    : 'bg-card text-ink-muted border-line hover:bg-subtle hover:text-ink hover:border-line-strong';
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
            className={`inline-flex items-center rounded-full font-medium transition-all whitespace-nowrap select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sizeClasses} ${getChipStyle(
              opt.label,
              opt.value,
              active
            )}`}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  active ? 'bg-current/15 text-current' : 'bg-subtle text-ink-light'
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