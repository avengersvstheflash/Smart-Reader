import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder = 'Search your library…',
  debounceMs = 250,
}) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localVal !== value) {
        onChange(localVal);
      }
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [localVal, debounceMs, onChange, value]);

  const handleClear = () => {
    setLocalVal('');
    onChange('');
  };

  return (
    <search className="relative flex items-center w-full max-w-md">
      <label htmlFor="library-search" className="sr-only">
        {placeholder}
      </label>
      <div className="absolute left-3 text-ink-light pointer-events-none flex items-center">
        <Search className="w-4 h-4" aria-hidden="true" />
      </div>
      <input
        id="library-search"
        type="search"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-8 text-ui-sm rounded-md border border-line bg-card text-ink placeholder:text-ink-light focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus:border-accent transition-colors"
      />
      {localVal && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 p-1 rounded-full text-ink-light hover:text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </search>
  );
};